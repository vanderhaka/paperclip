import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  approvals,
  companies,
  createDb,
  instanceSettings,
  issueApprovals,
  issueComments,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueService } from "../services/issues.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres issue comment board approval tests on this host: ${
      embeddedPostgresSupport.reason ?? "unsupported environment"
    }`,
  );
}

describeEmbeddedPostgres("issueService.addComment board approval intent", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof issueService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-issue-comment-approval-");
    db = createDb(tempDb.connectionString);
    svc = issueService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issueApprovals);
    await db.delete(approvals);
    await db.delete(issueComments);
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(instanceSettings);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("creates one linked board approval from an agent comment that asks for the board call", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const issueId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "JARVE",
      issuePrefix: "JARA",
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "CEO",
      role: "CEO",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(issues).values({
      id: issueId,
      companyId,
      identifier: "JARA-11",
      title: "Delegation",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: agentId,
    });

    await svc.addComment(
      issueId,
      "Done this heartbeat. Awaiting the board's call on JARA-11.",
      { agentId },
    );
    await svc.addComment(
      issueId,
      "Still awaiting the board's call on JARA-11.",
      { agentId },
    );

    const rows = await db
      .select({
        approvalId: approvals.id,
        issueId: issueApprovals.issueId,
        type: approvals.type,
        status: approvals.status,
        payload: approvals.payload,
      })
      .from(approvals)
      .innerJoin(issueApprovals, eq(issueApprovals.approvalId, approvals.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      issueId,
      type: "request_board_approval",
      status: "pending",
    });
    expect(rows[0]?.payload).toMatchObject({
      title: "Board call on JARA-11",
      issueId,
      issueIdentifier: "JARA-11",
      issueTitle: "Delegation",
    });
  });
});
