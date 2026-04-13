import { and, eq, inArray } from "drizzle-orm";
import { issues, type Db } from "@paperclipai/db";

export const ACTIVE_STATUSES = ["backlog", "todo", "in_progress"] as const;
export const TERMINAL_STATUSES = ["in_review", "blocked", "done", "cancelled"] as const;

export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export const MAX_MANAGEMENT_WALK_DEPTH = 10;

const ACTIVE_STATUS_SET: ReadonlySet<string> = new Set(ACTIVE_STATUSES);

export function isTerminalStatus(status: string | null | undefined): status is TerminalStatus {
  return (
    status === "in_review" ||
    status === "blocked" ||
    status === "done" ||
    status === "cancelled"
  );
}

/**
 * Returns `true` when `parentIssueId` has at least one descendant in an
 * active state (backlog/todo/in_progress) within MAX_MANAGEMENT_WALK_DEPTH
 * generations. Strictly company-scoped: every hop is filtered by the
 * parent's company_id.
 *
 * Implemented as a bounded BFS so cycles can't wedge the walk and so the
 * depth cap mirrors the Step 1 ancestor walker. Purely read-only.
 *
 * Deliberately does NOT consult any rollup field — Step 2 and Step 3 are
 * developed in parallel and this helper must work before Step 2 merges.
 */
export async function isManagingChildren(db: Db, parentIssueId: string): Promise<boolean> {
  const [parent] = await db
    .select({ id: issues.id, companyId: issues.companyId })
    .from(issues)
    .where(eq(issues.id, parentIssueId))
    .limit(1);
  if (!parent) return false;

  let frontier: string[] = [parent.id];
  const visited = new Set<string>([parent.id]);

  for (let depth = 0; depth < MAX_MANAGEMENT_WALK_DEPTH && frontier.length > 0; depth += 1) {
    const children = await db
      .select({ id: issues.id, status: issues.status })
      .from(issues)
      .where(and(eq(issues.companyId, parent.companyId), inArray(issues.parentId, frontier)));
    if (children.length === 0) return false;

    for (const child of children) {
      if (ACTIVE_STATUS_SET.has(child.status)) return true;
    }

    const nextFrontier: string[] = [];
    for (const child of children) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        nextFrontier.push(child.id);
      }
    }
    frontier = nextFrontier;
  }
  return false;
}

export interface ParentReadyForReviewSignal {
  id: string;
  assigneeAgentId: string;
  childIssueIds: string[];
}

/**
 * Returns the payload needed to wake a parent's assignee for human review,
 * or `null` when no wake should fire.
 *
 * A wake fires only when every one of these is true:
 *   - the parent exists and has an assignee agent
 *   - the parent is not already in a closed state (backlog/done/cancelled)
 *   - the parent has at least one direct child
 *   - `isManagingChildren` returns `false` — i.e. every transitive descendant
 *     is in a terminal state (in_review / blocked / done / cancelled)
 *
 * The caller should enqueue exactly one wake using the returned data; the
 * CEO (or whoever owns the parent) then decides whether to surface it to
 * the human user.
 */
export async function loadParentReadyForReviewSignal(
  db: Db,
  parentIssueId: string,
): Promise<ParentReadyForReviewSignal | null> {
  const [parent] = await db
    .select({
      id: issues.id,
      assigneeAgentId: issues.assigneeAgentId,
      status: issues.status,
      companyId: issues.companyId,
    })
    .from(issues)
    .where(eq(issues.id, parentIssueId))
    .limit(1);
  if (!parent || !parent.assigneeAgentId) return null;
  if (parent.status === "backlog" || parent.status === "done" || parent.status === "cancelled") {
    return null;
  }

  const children = await db
    .select({ id: issues.id })
    .from(issues)
    .where(and(eq(issues.companyId, parent.companyId), eq(issues.parentId, parentIssueId)));
  if (children.length === 0) return null;

  if (await isManagingChildren(db, parentIssueId)) return null;

  return {
    id: parent.id,
    assigneeAgentId: parent.assigneeAgentId,
    childIssueIds: children.map((child) => child.id),
  };
}
