// Integration tests for `issueService.list({ includeAncestors: true })`.
//
// Verifies that when the ancestor walk is enabled, every returned row carries
// an `inboxRole` of either "assigned" (in the base query result) or "ancestor"
// (pulled in via the recursive CTE parent walk), and that the feature is
// strictly scoped to the same companyId.

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  companies,
  createDb,
  executionWorkspaces,
  instanceSettings,
  issueComments,
  issueInboxArchives,
  issueRelations,
  issues,
  projectWorkspaces,
  projects,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueService } from "../services/issues.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

async function ensureIssueRelationsTable(db: ReturnType<typeof createDb>) {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "issue_relations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" uuid NOT NULL,
      "issue_id" uuid NOT NULL,
      "related_issue_id" uuid NOT NULL,
      "type" text NOT NULL,
      "created_by_agent_id" uuid,
      "created_by_user_id" text,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );
  `));
}

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres ancestor tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

type AncestorAwareIssue = Awaited<ReturnType<ReturnType<typeof issueService>["list"]>>[number] & {
  inboxRole?: "assigned" | "ancestor";
  rolledUpStatus?: string;
};

describeEmbeddedPostgres("issueService.list includeAncestors", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof issueService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-ancestors-");
    db = createDb(tempDb.connectionString);
    svc = issueService(db);
    await ensureIssueRelationsTable(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issueComments);
    await db.delete(issueRelations);
    await db.delete(issueInboxArchives);
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(executionWorkspaces);
    await db.delete(projectWorkspaces);
    await db.delete(projects);
    await db.delete(agents);
    await db.delete(instanceSettings);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany(name = "Paperclip") {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name,
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return companyId;
  }

  function roleById(rows: AncestorAwareIssue[]) {
    return new Map(rows.map((r) => [r.id, r.inboxRole ?? null] as const));
  }

  it("tags base rows as role=assigned when includeAncestors is set", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    const parentId = randomUUID();
    const childId = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "parent",
        status: "in_progress",
        priority: "medium",
        createdByUserId: userId,
      },
      {
        id: childId,
        companyId,
        title: "child",
        status: "todo",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    const roles = roleById(rows);
    expect(roles.get(parentId)).toBe("assigned");
    expect(roles.get(childId)).toBe("assigned");
  });

  it("pulls an unassigned parent in as role=ancestor when a child is in the base set", async () => {
    const companyId = await seedCompany();
    const userId = "alice";
    const otherUserId = "bob";

    const parentId = randomUUID();
    const childId = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "parent not touched by alice",
        status: "in_progress",
        priority: "high",
        createdByUserId: otherUserId,
      },
      {
        id: childId,
        companyId,
        title: "child touched by alice",
        status: "todo",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    const roles = roleById(rows);
    expect(roles.get(childId)).toBe("assigned");
    expect(roles.get(parentId)).toBe("ancestor");
  });

  it("returns a done-status parent as an ancestor (doesn't drop it based on status)", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    const parentId = randomUUID();
    const childId = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "finished parent",
        status: "done",
        priority: "medium",
        createdByUserId: "someone-else",
      },
      {
        id: childId,
        companyId,
        title: "child still in progress",
        status: "in_progress",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    const roles = roleById(rows);
    expect(roles.get(childId)).toBe("assigned");
    expect(roles.get(parentId)).toBe("ancestor");
  });

  it("walks a 3-level chain upward when only the leaf is in the base set", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    const rootId = randomUUID();
    const midId = randomUUID();
    const leafId = randomUUID();
    await db.insert(issues).values([
      {
        id: rootId,
        companyId,
        title: "root (ceo)",
        status: "in_progress",
        priority: "high",
        createdByUserId: "someone-else",
      },
      {
        id: midId,
        companyId,
        title: "mid (manager)",
        status: "in_progress",
        priority: "medium",
        parentId: rootId,
        createdByUserId: "someone-else",
      },
      {
        id: leafId,
        companyId,
        title: "leaf (engineer)",
        status: "todo",
        priority: "medium",
        parentId: midId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    const roles = roleById(rows);
    expect(roles.get(leafId)).toBe("assigned");
    expect(roles.get(midId)).toBe("ancestor");
    expect(roles.get(rootId)).toBe("ancestor");
  });

  it("is a strict no-op when includeAncestors is false or omitted", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    const parentId = randomUUID();
    const childId = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "unassigned parent",
        status: "in_progress",
        priority: "medium",
        createdByUserId: "someone-else",
      },
      {
        id: childId,
        companyId,
        title: "child",
        status: "todo",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
    })) as AncestorAwareIssue[];

    // Base behavior: parent is not returned and no inboxRole field is added.
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.has(childId)).toBe(true);
    expect(ids.has(parentId)).toBe(false);
    for (const row of rows) {
      expect(row.inboxRole).toBeUndefined();
    }
  });

  it("never crosses company boundaries when walking ancestors", async () => {
    const companyA = await seedCompany("A");
    const companyB = await seedCompany("B");
    const userId = "alice";

    // A fabricated cross-company link: insert a "parent" in company B, then
    // try to have a child in company A reference it. The DB FK allows this
    // (references issues.id, no companyId constraint), so the test proves
    // the CTE ancestor walk adds the companyId guard explicitly.
    const foreignParentId = randomUUID();
    const localChildId = randomUUID();
    await db.insert(issues).values([
      {
        id: foreignParentId,
        companyId: companyB,
        title: "parent in company B — should NEVER appear in A's inbox",
        status: "in_progress",
        priority: "high",
        createdByUserId: "someone-else",
      },
      {
        id: localChildId,
        companyId: companyA,
        title: "child in company A",
        status: "todo",
        priority: "medium",
        parentId: foreignParentId,
        createdByUserId: userId,
      },
    ]);

    const rowsA = (await svc.list(companyA, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    const rolesA = roleById(rowsA);
    expect(rolesA.get(localChildId)).toBe("assigned");
    expect(rolesA.has(foreignParentId)).toBe(false);
  });

  it("rolls a parent up to the highest-severity descendant status (in_progress beats todo)", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    const parentId = randomUUID();
    const childA = randomUUID();
    const childB = randomUUID();
    const childC = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "parent",
        status: "todo",
        priority: "medium",
        createdByUserId: userId,
      },
      {
        id: childA,
        companyId,
        title: "child A (in_progress)",
        status: "in_progress",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
      {
        id: childB,
        companyId,
        title: "child B (todo)",
        status: "todo",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
      {
        id: childC,
        companyId,
        title: "child C (todo)",
        status: "todo",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(parentId)?.rolledUpStatus).toBe("in_progress");
    expect(byId.get(childA)?.rolledUpStatus).toBe("in_progress");
    expect(byId.get(childB)?.rolledUpStatus).toBe("todo");
  });

  it("rolls a parent up to blocked when any descendant is blocked (even if others are done)", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    const parentId = randomUUID();
    const childA = randomUUID();
    const childB = randomUUID();
    const childC = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "parent",
        status: "in_progress",
        priority: "high",
        createdByUserId: userId,
      },
      {
        id: childA,
        companyId,
        title: "blocked child",
        status: "blocked",
        priority: "high",
        parentId,
        createdByUserId: userId,
      },
      {
        id: childB,
        companyId,
        title: "done child 1",
        status: "done",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
      {
        id: childC,
        companyId,
        title: "done child 2",
        status: "done",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    expect(rows.find((r) => r.id === parentId)?.rolledUpStatus).toBe("blocked");
  });

  it("rolls a parent up to done only when every descendant is done AND parent is done", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    const parentId = randomUUID();
    const childA = randomUUID();
    const childB = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "parent done",
        status: "done",
        priority: "medium",
        createdByUserId: userId,
      },
      {
        id: childA,
        companyId,
        title: "done child",
        status: "done",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
      {
        id: childB,
        companyId,
        title: "done child 2",
        status: "done",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    expect(rows.find((r) => r.id === parentId)?.rolledUpStatus).toBe("done");
  });

  it("does not roll a done parent to done when any descendant is non-done", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    const parentId = randomUUID();
    const childA = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "parent prematurely done",
        status: "done",
        priority: "medium",
        createdByUserId: userId,
      },
      {
        id: childA,
        companyId,
        title: "still in progress",
        status: "in_progress",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    expect(rows.find((r) => r.id === parentId)?.rolledUpStatus).toBe("in_progress");
  });

  it("prefers in_review over in_progress in severity ordering", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    const parentId = randomUUID();
    const childA = randomUUID();
    const childB = randomUUID();
    const childC = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "parent",
        status: "in_progress",
        priority: "medium",
        createdByUserId: userId,
      },
      {
        id: childA,
        companyId,
        title: "in_review child",
        status: "in_review",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
      {
        id: childB,
        companyId,
        title: "done child",
        status: "done",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
      {
        id: childC,
        companyId,
        title: "in_progress child",
        status: "in_progress",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    expect(rows.find((r) => r.id === parentId)?.rolledUpStatus).toBe("in_review");
  });

  it("bubbles up severity across a 3-level chain (deepest descendant wins)", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    const rootId = randomUUID();
    const midId = randomUUID();
    const leafId = randomUUID();
    await db.insert(issues).values([
      {
        id: rootId,
        companyId,
        title: "root",
        status: "in_progress",
        priority: "high",
        createdByUserId: "someone-else",
      },
      {
        id: midId,
        companyId,
        title: "mid",
        status: "in_progress",
        priority: "medium",
        parentId: rootId,
        createdByUserId: "someone-else",
      },
      {
        id: leafId,
        companyId,
        title: "leaf",
        status: "blocked",
        priority: "high",
        parentId: midId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(leafId)?.rolledUpStatus).toBe("blocked");
    expect(byId.get(midId)?.rolledUpStatus).toBe("blocked");
    expect(byId.get(rootId)?.rolledUpStatus).toBe("blocked");
  });

  it("treats a leaf row's rollup as equal to its own status", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    const soloId = randomUUID();
    await db.insert(issues).values({
      id: soloId,
      companyId,
      title: "solo leaf",
      status: "in_review",
      priority: "medium",
      createdByUserId: userId,
    });

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    expect(rows.find((r) => r.id === soloId)?.rolledUpStatus).toBe("in_review");
  });

  it("omits rolledUpStatus entirely when includeAncestors is false", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    const parentId = randomUUID();
    const childId = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "parent",
        status: "todo",
        priority: "medium",
        createdByUserId: userId,
      },
      {
        id: childId,
        companyId,
        title: "child",
        status: "in_progress",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
    })) as AncestorAwareIssue[];

    for (const row of rows) {
      expect(row.rolledUpStatus).toBeUndefined();
    }
  });

  it("handles a 2-node cycle between rows and surfaces a blocked sibling to every cycle node", async () => {
    // Regression test for the memoization-under-cycles bug Codex caught on
    // the first pass: with a shared cross-query memo, computing A's rollup
    // first would poison B's cached result because B's cycle back-edge to A
    // swaps in A's own status instead of its full descendant closure. The
    // no-memo DFS we ship here recomputes each top-level row fresh so both
    // A and B see the blocked sibling through their full reachable set.
    const companyId = await seedCompany();
    const userId = "alice";

    const aId = randomUUID();
    const bId = randomUUID();
    const cId = randomUUID();
    await db.insert(issues).values([
      {
        id: aId,
        companyId,
        title: "A",
        status: "todo",
        priority: "medium",
        createdByUserId: userId,
      },
      {
        id: bId,
        companyId,
        title: "B",
        status: "done",
        priority: "medium",
        createdByUserId: userId,
      },
      {
        id: cId,
        companyId,
        title: "C (blocked sibling of B under A)",
        status: "blocked",
        priority: "high",
        parentId: aId,
        createdByUserId: userId,
      },
    ]);
    // Wire the A <-> B cycle with raw updates so we bypass any app-level
    // guard against creating cyclic parent_id chains.
    await db.update(issues).set({ parentId: bId }).where(eq(issues.id, aId));
    await db.update(issues).set({ parentId: aId }).where(eq(issues.id, bId));

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    const byId = new Map(rows.map((r) => [r.id, r]));
    // A → {B, C}: directly reaches blocked via C.
    expect(byId.get(aId)?.rolledUpStatus).toBe("blocked");
    // B → A → {B(cycle), C}: reaches blocked via A's non-cycle child C.
    expect(byId.get(bId)?.rolledUpStatus).toBe("blocked");
  });

  it("propagates severity correctly through a chain deeper than the legacy depth cap", async () => {
    // Regression test for the depth-cap memoization bug Codex caught on the
    // first pass: a cached result captured at the depth-10 bailout boundary
    // would leak a partial rollup to later sibling/top-level queries. With
    // no cross-query memo, a 12-node chain in the response set must still
    // bubble a deeply nested blocked status all the way to the root.
    const companyId = await seedCompany();
    const userId = "alice";

    const CHAIN_LENGTH = 12;
    const ids = Array.from({ length: CHAIN_LENGTH }, () => randomUUID());
    const rowsToInsert = ids.map((id, i) => ({
      id,
      companyId,
      title: `chain[${i}]`,
      status: i === CHAIN_LENGTH - 1 ? "blocked" : "todo",
      priority: "medium",
      parentId: i === 0 ? null : ids[i - 1],
      createdByUserId: userId,
    }));
    await db.insert(issues).values(rowsToInsert);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    const byId = new Map(rows.map((r) => [r.id, r]));
    // Every node in the chain should be present in the response set (all
    // touched by the user) and every one should roll up to blocked — the
    // deepest node's severity must propagate all 11 levels to the root.
    for (let i = 0; i < CHAIN_LENGTH; i++) {
      expect(byId.has(ids[i])).toBe(true);
      expect(byId.get(ids[i])?.rolledUpStatus).toBe("blocked");
    }
  });

  it("ignores cancelled descendants when aggregating", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    const parentId = randomUUID();
    const cancelledChildId = randomUUID();
    const doneChildId = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "parent",
        status: "done",
        priority: "medium",
        createdByUserId: userId,
      },
      {
        id: cancelledChildId,
        companyId,
        title: "cancelled child",
        status: "cancelled",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
      {
        id: doneChildId,
        companyId,
        title: "done child",
        status: "done",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      // include cancelled so the cancelled child enters the response set
      status: "backlog,todo,in_progress,in_review,blocked,done,cancelled",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    // The cancelled child must not block the parent from rolling up to done.
    expect(rows.find((r) => r.id === parentId)?.rolledUpStatus).toBe("done");
  });

  it("de-duplicates ancestors already present in the base result set", async () => {
    const companyId = await seedCompany();
    const userId = "alice";

    // Both parent and child are touched by user → both are in base set.
    // The recursive CTE would otherwise also mark parent as an ancestor of
    // the child. The merge logic must only emit the parent once and keep
    // it as role=assigned (base wins).
    const parentId = randomUUID();
    const childId = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "parent",
        status: "in_progress",
        priority: "medium",
        createdByUserId: userId,
      },
      {
        id: childId,
        companyId,
        title: "child",
        status: "todo",
        priority: "medium",
        parentId,
        createdByUserId: userId,
      },
    ]);

    const rows = (await svc.list(companyId, {
      touchedByUserId: userId,
      status: "backlog,todo,in_progress,in_review,blocked,done",
      includeAncestors: true,
    })) as AncestorAwareIssue[];

    expect(rows.filter((r) => r.id === parentId)).toHaveLength(1);
    expect(rows.find((r) => r.id === parentId)?.inboxRole).toBe("assigned");
  });
});
