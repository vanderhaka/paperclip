// Goal progress rollup.
//
// A goal "progresses" through linked work:
//   - issues directly attached to the goal (issues.goalId)
//   - issues in projects linked to the goal (projects.goalId or project_goals)
//   - issues anywhere in the subtree (sub-goals via goals.parentId)
//
// Manual `currentValue`/`targetValue` on the goal still wins when set; this
// service supplies a fallback when the user hasn't filled them in. Both are
// returned to the client; the UI decides which to render.

import { and, eq, inArray, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { goals, projects, projectGoals, issues } from "@paperclipai/db";

export interface GoalProgress {
  doneCount: number;
  totalCount: number;
  percent: number | null;
  source: "issues";
}

const DONE_STATUS = "done";
const EXCLUDED_STATUS = "cancelled";

function expandSubtree(
  rootId: string,
  parentByChild: Map<string, string | null>,
  childrenByParent: Map<string, string[]>,
): Set<string> {
  void parentByChild;
  const out = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const next = queue.shift()!;
    const kids = childrenByParent.get(next) ?? [];
    for (const k of kids) {
      if (!out.has(k)) {
        out.add(k);
        queue.push(k);
      }
    }
    if (out.size > 5000) break; // safety
  }
  return out;
}

interface RolledUpInputs {
  goalRows: Array<{ id: string; parentId: string | null }>;
  projectRows: Array<{ id: string; goalId: string | null }>;
  projectGoalRows: Array<{ projectId: string; goalId: string }>;
  issueRows: Array<{ id: string; status: string; goalId: string | null; projectId: string | null }>;
}

function rollupBreakdown(rootId: string, inputs: RolledUpInputs): GoalProgress {
  const childrenByParent = new Map<string, string[]>();
  const parentByChild = new Map<string, string | null>();
  for (const g of inputs.goalRows) {
    parentByChild.set(g.id, g.parentId);
    if (g.parentId) {
      const arr = childrenByParent.get(g.parentId) ?? [];
      arr.push(g.id);
      childrenByParent.set(g.parentId, arr);
    }
  }

  const subtreeGoalIds = expandSubtree(rootId, parentByChild, childrenByParent);

  // Projects linked to any goal in the subtree
  const linkedProjectIds = new Set<string>();
  for (const p of inputs.projectRows) {
    if (p.goalId && subtreeGoalIds.has(p.goalId)) linkedProjectIds.add(p.id);
  }
  for (const link of inputs.projectGoalRows) {
    if (subtreeGoalIds.has(link.goalId)) linkedProjectIds.add(link.projectId);
  }

  // Issues that count: direct goal-link, or in a linked project
  let total = 0;
  let done = 0;
  for (const issue of inputs.issueRows) {
    if (issue.status === EXCLUDED_STATUS) continue;
    const directHit = issue.goalId !== null && subtreeGoalIds.has(issue.goalId);
    const projectHit = issue.projectId !== null && linkedProjectIds.has(issue.projectId);
    if (!directHit && !projectHit) continue;
    total++;
    if (issue.status === DONE_STATUS) done++;
  }

  return {
    doneCount: done,
    totalCount: total,
    percent: total > 0 ? Math.round((done / total) * 100) : null,
    source: "issues",
  };
}

async function loadCompanyGraph(db: Db, companyId: string): Promise<RolledUpInputs> {
  const [goalRows, projectRows, projectGoalRows, issueRows] = await Promise.all([
    db
      .select({ id: goals.id, parentId: goals.parentId })
      .from(goals)
      .where(eq(goals.companyId, companyId)),
    db
      .select({ id: projects.id, goalId: projects.goalId })
      .from(projects)
      .where(eq(projects.companyId, companyId)),
    db
      .select({ projectId: projectGoals.projectId, goalId: projectGoals.goalId })
      .from(projectGoals)
      .where(eq(projectGoals.companyId, companyId)),
    db
      .select({
        id: issues.id,
        status: issues.status,
        goalId: issues.goalId,
        projectId: issues.projectId,
      })
      .from(issues)
      .where(eq(issues.companyId, companyId)),
  ]);
  return { goalRows, projectRows, projectGoalRows, issueRows };
}

export async function computeGoalProgress(db: Db, goalId: string): Promise<GoalProgress | null> {
  const goal = await db
    .select({ id: goals.id, companyId: goals.companyId })
    .from(goals)
    .where(eq(goals.id, goalId))
    .then((r) => r[0] ?? null);
  if (!goal) return null;
  const inputs = await loadCompanyGraph(db, goal.companyId);
  return rollupBreakdown(goalId, inputs);
}

export async function computeCompanyGoalProgress(
  db: Db,
  companyId: string,
): Promise<Map<string, GoalProgress>> {
  const inputs = await loadCompanyGraph(db, companyId);
  const result = new Map<string, GoalProgress>();
  for (const g of inputs.goalRows) {
    result.set(g.id, rollupBreakdown(g.id, inputs));
  }
  return result;
}
