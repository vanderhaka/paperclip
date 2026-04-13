import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  companies,
  createDb,
  executionWorkspaces,
  issueComments,
  issueInboxArchives,
  issueRelations,
  issues,
  projectWorkspaces,
  projects,
  instanceSettings,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import {
  MAX_MANAGEMENT_WALK_DEPTH,
  isManagingChildren,
  loadParentReadyForReviewSignal,
} from "../services/issue-management.ts";

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
    `Skipping embedded Postgres issue management tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issue-management helpers", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;
  let otherCompanyId!: string;
  let ceoAgentId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-issue-management-");
    db = createDb(tempDb.connectionString);
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

  async function seedCompanyAndAgent() {
    companyId = randomUUID();
    otherCompanyId = randomUUID();
    ceoAgentId = randomUUID();
    await db.insert(companies).values([
      {
        id: companyId,
        name: "Paperclip",
        issuePrefix: "PAP",
        requireBoardApprovalForNewAgents: false,
      },
      {
        id: otherCompanyId,
        name: "Other Co",
        issuePrefix: "OTH",
        requireBoardApprovalForNewAgents: false,
      },
    ]);
    await db.insert(agents).values({
      id: ceoAgentId,
      companyId,
      name: "CEO",
      role: "ceo",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
  }

  async function insertIssue(overrides: {
    id?: string;
    parentId?: string | null;
    status: string;
    assigneeAgentId?: string | null;
    companyOverride?: string;
    title?: string;
  }) {
    const id = overrides.id ?? randomUUID();
    await db.insert(issues).values({
      id,
      companyId: overrides.companyOverride ?? companyId,
      title: overrides.title ?? `issue-${id.slice(0, 6)}`,
      status: overrides.status,
      priority: "medium",
      parentId: overrides.parentId ?? null,
      assigneeAgentId: overrides.assigneeAgentId ?? null,
    });
    return id;
  }

  describe("isManagingChildren", () => {
    it("returns false when the parent has no children", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: ceoAgentId });
      expect(await isManagingChildren(db, parent)).toBe(false);
    });

    it("returns true when any direct child is todo", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: ceoAgentId });
      await insertIssue({ parentId: parent, status: "todo" });
      await insertIssue({ parentId: parent, status: "done" });
      expect(await isManagingChildren(db, parent)).toBe(true);
    });

    it("returns true when any direct child is in_progress", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: ceoAgentId });
      await insertIssue({ parentId: parent, status: "in_progress" });
      expect(await isManagingChildren(db, parent)).toBe(true);
    });

    it("returns true when any direct child is backlog", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: ceoAgentId });
      await insertIssue({ parentId: parent, status: "backlog" });
      expect(await isManagingChildren(db, parent)).toBe(true);
    });

    it("returns false when every direct child is terminal", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: ceoAgentId });
      await insertIssue({ parentId: parent, status: "done" });
      await insertIssue({ parentId: parent, status: "in_review" });
      await insertIssue({ parentId: parent, status: "blocked" });
      await insertIssue({ parentId: parent, status: "cancelled" });
      expect(await isManagingChildren(db, parent)).toBe(false);
    });

    it("walks the full descendant closure, not just direct children", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: ceoAgentId });
      const mid = await insertIssue({ parentId: parent, status: "in_review" });
      // Direct child is terminal (in_review), but its own child is in_progress.
      await insertIssue({ parentId: mid, status: "in_progress" });
      expect(await isManagingChildren(db, parent)).toBe(true);
    });

    it("returns false when deep closure is fully terminal", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: ceoAgentId });
      const mid = await insertIssue({ parentId: parent, status: "in_review" });
      await insertIssue({ parentId: mid, status: "done" });
      await insertIssue({ parentId: mid, status: "blocked" });
      expect(await isManagingChildren(db, parent)).toBe(false);
    });

    it("never crosses a company boundary", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: ceoAgentId });
      // Sibling tree in other company with an active child — must be ignored.
      await insertIssue({
        parentId: parent,
        status: "in_progress",
        companyOverride: otherCompanyId,
      });
      expect(await isManagingChildren(db, parent)).toBe(false);
    });

    it("returns false for an unknown parent id", async () => {
      await seedCompanyAndAgent();
      expect(await isManagingChildren(db, randomUUID())).toBe(false);
    });

    it("respects the MAX_MANAGEMENT_WALK_DEPTH cap", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: ceoAgentId });
      let current = parent;
      // Build a chain of terminal nodes longer than the cap, with an active
      // leaf at the very bottom. Because the leaf sits beyond the cap, the
      // walker should return false.
      for (let i = 0; i < MAX_MANAGEMENT_WALK_DEPTH + 1; i += 1) {
        current = await insertIssue({ parentId: current, status: "in_review" });
      }
      await insertIssue({ parentId: current, status: "in_progress" });
      expect(await isManagingChildren(db, parent)).toBe(false);
    });
  });

  describe("loadParentReadyForReviewSignal", () => {
    it("returns null when the parent has no children", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: ceoAgentId });
      expect(await loadParentReadyForReviewSignal(db, parent)).toBeNull();
    });

    it("returns null when the parent is still managing descendants", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: ceoAgentId });
      await insertIssue({ parentId: parent, status: "in_progress" });
      expect(await loadParentReadyForReviewSignal(db, parent)).toBeNull();
    });

    it("returns null when the parent has no assignee agent", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: null });
      await insertIssue({ parentId: parent, status: "done" });
      expect(await loadParentReadyForReviewSignal(db, parent)).toBeNull();
    });

    it("returns null when the parent itself is done", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "done", assigneeAgentId: ceoAgentId });
      await insertIssue({ parentId: parent, status: "done" });
      expect(await loadParentReadyForReviewSignal(db, parent)).toBeNull();
    });

    it("returns the wake signal when every descendant is terminal", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: ceoAgentId });
      const a = await insertIssue({ parentId: parent, status: "done" });
      const b = await insertIssue({ parentId: parent, status: "in_review" });
      const c = await insertIssue({ parentId: parent, status: "blocked" });
      const signal = await loadParentReadyForReviewSignal(db, parent);
      expect(signal).not.toBeNull();
      expect(signal!.id).toBe(parent);
      expect(signal!.assigneeAgentId).toBe(ceoAgentId);
      expect(new Set(signal!.childIssueIds)).toEqual(new Set([a, b, c]));
    });

    it("returns the wake signal when a deep descendant was the last active one to flip terminal", async () => {
      await seedCompanyAndAgent();
      const parent = await insertIssue({ status: "in_progress", assigneeAgentId: ceoAgentId });
      const mid = await insertIssue({ parentId: parent, status: "in_review" });
      await insertIssue({ parentId: mid, status: "done" });
      await insertIssue({ parentId: mid, status: "blocked" });
      const signal = await loadParentReadyForReviewSignal(db, parent);
      expect(signal).not.toBeNull();
      expect(signal!.childIssueIds).toEqual([mid]);
    });
  });
});
