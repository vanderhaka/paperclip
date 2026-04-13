// Integration tests for `issueService.list({ includeAncestors: true })`.
//
// Verifies that when the ancestor walk is enabled, every returned row carries
// an `inboxRole` of either "assigned" (in the base query result) or "ancestor"
// (pulled in via the recursive CTE parent walk), and that the feature is
// strictly scoped to the same companyId.

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
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
