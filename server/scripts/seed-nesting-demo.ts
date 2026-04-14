// Seed demo scenarios to verify inbox ancestor-nesting end-to-end.
//
// Scenario 1 — parent NOT touched by user, child IS (ancestor header case).
// Scenario 2 — 3-level chain (CEO → manager → engineer) with only the leaf
//              touched by the user (grandparent + parent both as ancestors).
//
// Gating:
//   - This script is opt-in. It refuses to run unless
//     `PAPERCLIP_SEED_DEMO_DATA=true` is set in the environment. This prevents
//     `[demo]` rows from bleeding into real first-run inboxes when the script
//     is invoked accidentally (muscle memory, CI, another agent, etc.).
//   - Pass `--clean` to purge (soft-hide) any existing `[demo]%` rows and exit
//     without re-seeding. Useful for restoring a clean inbox on a dev DB that
//     was previously seeded.
//
// Run (seed):  PAPERCLIP_SEED_DEMO_DATA=true pnpm --filter @paperclipai/server seed:demo
// Run (clean): PAPERCLIP_SEED_DEMO_DATA=true pnpm --filter @paperclipai/server seed:demo:clean

import { createDb, companies, agents, issues } from "@paperclipai/db";
import { and, eq, like } from "drizzle-orm";
import { issueService } from "../src/services/issues.ts";

const REAL_USER_ID = "GLcgAQMPQNKcLkxEm5M4PMh0mh6odDDe"; // James

const SEED_FLAG = process.env.PAPERCLIP_SEED_DEMO_DATA;
const CLEAN_ONLY = process.argv.includes("--clean");

if (SEED_FLAG !== "true") {
  console.error(
    "Refusing to run: demo seeding is gated behind PAPERCLIP_SEED_DEMO_DATA=true.\n" +
      "This prevents [demo] rows from polluting real first-run inboxes.\n\n" +
      "To seed demo scenarios:\n" +
      "  PAPERCLIP_SEED_DEMO_DATA=true pnpm --filter @paperclipai/server seed:demo\n\n" +
      "To purge previously-seeded demo rows without re-seeding:\n" +
      "  PAPERCLIP_SEED_DEMO_DATA=true pnpm --filter @paperclipai/server seed:demo:clean",
  );
  process.exit(1);
}

const db = createDb("postgres://paperclip:paperclip@127.0.0.1:54329/paperclip");

async function main() {
  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .limit(1);
  if (!company) {
    console.error("No company found");
    process.exit(1);
  }
  console.log(`company: ${company.name}`);

  // Hide previous demo issues (soft delete via hiddenAt — the list endpoint
  // already filters on `hiddenAt IS NULL`, so this effectively removes them
  // from the inbox without running into FK constraints from comments/activity).
  const hideResult = await db
    .update(issues)
    .set({ hiddenAt: new Date() })
    .where(and(eq(issues.companyId, company.id), like(issues.title, "[demo]%")));
  console.log(`hid previous demo issues (update result: ${JSON.stringify(hideResult)})`);

  if (CLEAN_ONLY) {
    console.log("\n--clean specified — purge complete, skipping re-seed.");
    process.exit(0);
  }

  const agentRows = await db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(eq(agents.companyId, company.id));
  const byName = (name: string) => {
    const a = agentRows.find((r) => r.name === name);
    if (!a) throw new Error(`Missing agent: ${name}`);
    return a;
  };
  const ceo = byName("CEO");
  const cto = byName("CTO");
  const eng1 = byName("Software Engineer");
  const eng2 = byName("Software Engineer 2");
  const eng3 = byName("Software Engineer 3");

  const svc = issueService(db);

  // ---------- Scenario 1: parent = CEO, children = engineers ----------
  // Parent created by local-board (NOT the logged-in user). Children created
  // BY the logged-in user, so they land in his "Mine" inbox. The ancestor walk
  // should pull the parent in as a muted header.
  console.log("\nScenario 1: ancestor header case");
  const s1Parent = await svc.create(company.id, {
    title: "[demo] Scenario 1 — CEO rollout plan (parent)",
    description: "Assigned to CEO, created by local-board. Should appear as a MUTED ancestor header in James's inbox because a child below IS in his inbox.",
    status: "in_progress",
    priority: "high",
    assigneeAgentId: ceo.id,
    createdByUserId: "local-board",
  });
  console.log(`  parent: ${s1Parent.identifier} (assignee CEO, creator local-board)`);

  for (const [idx, worker] of [eng1, eng2, eng3].entries()) {
    const child = await svc.create(company.id, {
      title: `[demo] S1 subtask ${idx + 1}: ${worker.name}`,
      description: "Touched by James — should appear in his inbox under the ancestor parent.",
      status: idx === 0 ? "todo" : idx === 1 ? "in_progress" : "blocked",
      priority: "medium",
      assigneeAgentId: worker.id,
      createdByUserId: REAL_USER_ID,
    });
    // Link as child (second write because validator may reject parentId + new)
    await db
      .update(issues)
      .set({ parentId: s1Parent.id })
      .where(eq(issues.id, child.id));
    console.log(`  child:  ${child.identifier} (assignee ${worker.name}, creator James)`);
  }

  // ---------- Scenario 2: 3-level chain ----------
  console.log("\nScenario 2: 3-level chain");
  const s2Root = await svc.create(company.id, {
    title: "[demo] Scenario 2 — Root task (CEO)",
    description: "Grandparent, NOT in James's inbox directly.",
    status: "in_progress",
    priority: "high",
    assigneeAgentId: ceo.id,
    createdByUserId: "local-board",
  });
  const s2Mid = await svc.create(company.id, {
    title: "[demo] Scenario 2 — Mid task (CTO)",
    description: "Parent, NOT in James's inbox directly.",
    status: "in_progress",
    priority: "medium",
    assigneeAgentId: cto.id,
    createdByUserId: "local-board",
  });
  await db.update(issues).set({ parentId: s2Root.id }).where(eq(issues.id, s2Mid.id));

  const s2Leaf = await svc.create(company.id, {
    title: "[demo] Scenario 2 — Leaf task (engineer)",
    description: "Touched by James — only this should be in base inbox set.",
    status: "todo",
    priority: "medium",
    assigneeAgentId: eng1.id,
    createdByUserId: REAL_USER_ID,
  });
  await db.update(issues).set({ parentId: s2Mid.id }).where(eq(issues.id, s2Leaf.id));
  console.log(`  root: ${s2Root.identifier} → mid: ${s2Mid.identifier} → leaf: ${s2Leaf.identifier}`);

  // ---------- Scenario 3: rollup status ----------
  // Parent is stored as `done` but one child is still in_progress → the
  // rollup must pull the parent's displayed status back to `in_progress`.
  // This is the "parent doesn't go green until all sub tasks are green" case.
  console.log("\nScenario 3: rollup — parent stored as done but child still in_progress");
  const s3Parent = await svc.create(company.id, {
    title: "[demo] Scenario 3 — Prematurely done parent",
    description:
      "Parent is stored as done but one child is still in_progress. Rollup should display the parent as in_progress in the inbox.",
    status: "done",
    priority: "medium",
    assigneeAgentId: ceo.id,
    createdByUserId: "local-board",
  });
  const s3DoneChild = await svc.create(company.id, {
    title: "[demo] S3 subtask 1: done",
    description: "Done child — by itself would keep parent green.",
    status: "done",
    priority: "medium",
    assigneeAgentId: eng2.id,
    createdByUserId: REAL_USER_ID,
  });
  await db.update(issues).set({ parentId: s3Parent.id }).where(eq(issues.id, s3DoneChild.id));
  const s3InProgressChild = await svc.create(company.id, {
    title: "[demo] S3 subtask 2: still in_progress",
    description: "This child drags the parent's rolled-up status back to in_progress.",
    status: "in_progress",
    priority: "medium",
    assigneeAgentId: eng3.id,
    createdByUserId: REAL_USER_ID,
  });
  await db.update(issues).set({ parentId: s3Parent.id }).where(eq(issues.id, s3InProgressChild.id));
  console.log(`  parent: ${s3Parent.identifier} (stored done)`);
  console.log(`  children: ${s3DoneChild.identifier} (done), ${s3InProgressChild.identifier} (in_progress)`);

  console.log("\nDone. Refresh http://127.0.0.1:3100 and check the 'Mine' tab.");
  console.log("Expected:");
  console.log("  • Scenario 1 parent shown as MUTED ancestor row with 3 engineer children nested");
  console.log("  • Scenario 1 parent's STATUS ICON rolls up to blocked (severity of blocked child)");
  console.log("  • Scenario 2 shows 3-level nesting: Root → Mid → Leaf");
  console.log("  • Scenario 3 parent shows in_progress even though it's stored as done");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
