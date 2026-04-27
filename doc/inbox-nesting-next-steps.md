# Inbox Delegation Nesting — Steps 2 & 3 Spec

**Status:** Step 1 is complete and merged into `master` (working tree); Steps 2 and 3 are planned but not started.
**Owner:** James
**Author of this spec:** Claude (handed off from the 2026-04-13 session)
**Intended audience:** Claude Code (next session) or a developer picking this up fresh.

---

## 1. Context — what Step 1 already landed

### 1.1 Feature

Delegated child tasks in the inbox now **nest under their parent**, even when the parent is assigned to someone else. The "parent" row renders as a **muted, non-clickable context header**; the children below it are normal, interactive rows.

Example inbox after Step 1:

```
▸ (header)  Scenario 2 — Root task              CEO         ancestor, not touched by user
  ▸ (header)  Scenario 2 — Mid task              CTO         ancestor, depth 1
      ·          Scenario 2 — Leaf task           Engineer    assigned (created by user)
▸ (header)  Scenario 1 — CEO rollout plan       CEO         ancestor
      ·          Subtask 1: Software Engineer    SE          assigned
      ·          Subtask 2: Software Engineer 2  SE2         assigned
      ·          Subtask 3: Software Engineer 3  SE3         assigned
```

### 1.2 Architecture summary

- **Server** `GET /companies/:id/issues?includeAncestors=true`
  - Runs the normal `svc.list()` base query.
  - If the base set is non-empty, runs a recursive CTE to walk `parent_id` upward up to depth 10, strictly scoped by `company_id`.
  - Tags every returned row with `inboxRole: "assigned" | "ancestor"`.
  - Backward compatible: when the flag is false/omitted, the response shape is unchanged and `inboxRole` is not emitted.
- **UI** `ui/src/pages/Inbox.tsx`
  - `mineIssuesRaw` query sends `includeAncestors: true`.
  - `renderInboxIssue` derives `isAncestorHeader` from `issue.inboxRole === "ancestor"` and passes `asHeader` to `IssueRow`.
  - Render loop + flat-nav index builder + `flatNavItems` (keyboard traversal) are all recursive, with depth cap 10 and per-branch visited set cycle guards.
  - `collapsedInboxParents` state persists to `localStorage` with stale-ID pruning whenever `groupedSections` changes.
- **`IssueRow`** `ui/src/components/IssueRow.tsx`
  - New `asHeader` prop. When true, renders content inside a non-interactive `<div>` (with `data-inbox-issue-header`) instead of the clickable `<Link>`; skips the unread dot and archive controls; applies muted `bg-muted/30 text-muted-foreground cursor-default` classes.

### 1.3 Files touched in Step 1

| File | Purpose |
|---|---|
| `packages/shared/src/types/issue.ts` | Added optional `inboxRole?: "assigned" \| "ancestor"` to `Issue` |
| `server/src/services/issues.ts` | `list()` refactored; enrichment extracted into local `enrichRows` closure; recursive CTE ancestor walk after base enrichment |
| `server/src/routes/issues.ts` | Passes `includeAncestors` query param through to the service |
| `ui/src/api/issues.ts` | Filter type + URL param passthrough for `includeAncestors` |
| `ui/src/lib/inbox.ts` | New `loadInboxCollapsedParents` / `saveInboxCollapsedParents` helpers |
| `ui/src/pages/Inbox.tsx` | Recursive render + recursive flat-nav + `asHeader` wiring + collapse persistence |
| `ui/src/components/IssueRow.tsx` | New `asHeader` variant |
| `server/src/__tests__/issues-service-ancestors.test.ts` | 7 new integration tests |
| `ui/src/components/IssueRow.test.tsx` | 1 new test for `asHeader` variant |
| `server/scripts/seed-nesting-demo.ts` | Seed script for manual/playwright verification (dev-only) |
| `scripts/inbox-nesting-smoke.ts` | Playwright smoke harness that asserts row kind, indent, and bg color |

### 1.4 Quality gates that already pass

- `pnpm --filter @paperclipai/server typecheck` ✓
- `pnpm --filter @paperclipai/ui typecheck` ✓
- `pnpm test:run` → 1251 tests passing, 0 failing
- Playwright smoke → 10 rendered rows match expected HEADER/LINK/indent shape
- Codex GPT-5.3-Codex review of the full diff → `GO-WITH-CHANGES`, every flagged item already addressed

### 1.5 Constants and invariants to preserve

- **Status enum** (`packages/shared/src/constants.ts:114`): `backlog, todo, in_progress, in_review, done, blocked, cancelled`
- **Mine-tab status filter** (`packages/shared/src/constants.ts:125`): `backlog, todo, in_progress, in_review, blocked, done` (excludes `cancelled`)
- **Priority enum** (`packages/shared/src/constants.ts:135`): `critical, high, medium, low`
- **Nesting depth cap**: 10 levels, enforced in the CTE, the flat-nav builder, and the recursive renderer
- **Ancestor walk scoping**: same `company_id` at every CTE step, no exceptions
- **`inboxRole` is response-only**: never persisted to the DB, never accepted as an input

### 1.6 Parallelization contract — DO NOT CHANGE

**Step 2 and Step 3 are designed to be implementable in parallel sessions.** Both sessions must treat this section as locked. If you need to revise any of these rules, stop and sync with the other session first.

#### 1.6.1 Terminal-status truth table

Every rollup decision and every "is this parent still managing children?" decision uses the same classification:

| Status | Class | Meaning |
|---|---|---|
| `todo` | **active** | Child is queued but not started — parent is still managing |
| `in_progress` | **active** | Child is actively working — parent is still managing |
| `in_review` | **terminal** | Child needs human review — parent can surface this to user |
| `blocked` | **terminal** | Child is stuck — parent can surface this to user |
| `done` | **terminal** | Child is complete |
| `cancelled` | **terminal (ignored for rollup)** | Child is cancelled — excluded from aggregation entirely |
| `backlog` | **active** | Treated like `todo` |

**Derived rule:** A parent is "still managing children" if **any** descendant is in the `active` class. A parent is "ready for review" if **every** descendant is in the `terminal` class.

#### 1.6.2 Rollup rules (Step 2 contract)

- `rolledUpStatus` is computed as the **highest-severity status** among the parent's own status AND every descendant in the response set. Severity order (highest to lowest):
  ```
  blocked  >  in_review  >  in_progress  >  todo / backlog  >  done
  ```
- **`done` is only produced when every non-cancelled descendant — recursively — is `done` AND the parent itself is `done`.** Any child in any other status flips the parent's rollup to that child's severity. *This is the "parent doesn't go green until all subtasks are green" rule.*
- `cancelled` descendants are ignored for aggregation (they don't block `done`, they don't contribute severity).
- A leaf (no descendants in response set) has `rolledUpStatus === status`.
- **Future enhancement (out of scope for Step 2):** per-parent opt-out of the strict "all children must be done" rule. Leave a TODO comment in the service, but implement the strict rule only.

#### 1.6.3 Design lock for Step 3

- **Step 3 MUST use Design A (derived state, no schema change).** Do not add an `awaiting_review` column or an `execution_state.phase` value. All "is this parent ready for review?" decisions must be computed on demand.
- Step 3's `isManagingChildren(parentId)` helper MUST walk the DB itself via its own recursive CTE. **It must NOT read `issue.rolledUpStatus` from the Step 2 response**, because Step 2 and Step 3 are developed in parallel and Step 3 cannot assume Step 2 is merged yet.
- After both steps land, a follow-up commit MAY simplify `isManagingChildren` to check `rolledUpStatus` instead. That's a post-merge optimization, not part of Step 3.

#### 1.6.4 File ownership — who edits what

| File | Step 2 session | Step 3 session |
|---|---|---|
| `server/src/services/issues.ts` | ✅ adds rollup post-processing in `list()` | ❌ do not touch |
| `server/src/services/issue-assignment-wakeup.ts` | ❌ do not touch | ✅ gating logic |
| `server/src/services/issue-management.ts` (new file) | ❌ do not create | ✅ new file, `isManagingChildren` helper |
| `server/src/services/heartbeat-*.ts` | ❌ do not touch | ✅ CEO heartbeat check |
| `server/src/onboarding-assets/ceo/AGENTS.md` | ❌ do not touch | ✅ prompt rule addition |
| `packages/shared/src/types/issue.ts` | ✅ adds `rolledUpStatus?: IssueStatus` | ❌ do not touch |
| `ui/src/components/IssueRow.tsx` | ✅ new `rolledUpStatus` display prop | ❌ do not touch |
| `ui/src/pages/Inbox.tsx` | ✅ wires rolled-up icon into `renderInboxIssue` | ❌ do not touch |
| `ui/src/lib/inbox.ts` | ✅ optional: rollup helper if needed | ❌ do not touch |
| New test files | `issues-service-ancestors.test.ts` (extend) | `issue-management.test.ts` (new) + `issue-assignment-wakeup.test.ts` (new) |

If a file isn't listed, check with the user before touching it.

#### 1.6.5 Merge order

1. **Step 2 session completes first and commits its branch.** Verify: `pnpm test:run` is green, Playwright smoke passes, Codex review is GO.
2. **Step 3 session rebases onto the new master that includes Step 2.** Run full test suite after rebase. Any merge conflicts are almost certainly in `Inbox.tsx` near the render loop — resolve by keeping both changes; they're orthogonal (Step 2 adds icon display, Step 3 doesn't touch the render path under Design A).
3. **Optional post-merge refactor** (new session, new commit): simplify `isManagingChildren` to `return row.rolledUpStatus === "in_progress" || row.rolledUpStatus === "todo"` once both are on master. Keep the CTE fallback available for callers that don't pass `includeAncestors`.

#### 1.6.6 Shared acceptance gate

Both sessions must run before declaring "done":

```bash
pnpm --filter @paperclipai/server typecheck
pnpm --filter @paperclipai/ui typecheck
pnpm test:run
pnpm --filter @paperclipai/server exec tsx ../scripts/inbox-nesting-smoke.ts
```

All four must pass. No exceptions, no flag skipping.

---

## 2. Step 2 — Parent status rollup

### 2.1 Goal

When a parent row is shown in the inbox (either as an ancestor header or as an assigned parent), its **visual status should reflect the aggregate state of its children** rather than just its own stored `status`.

User quote from the 2026-04-13 session:

> "main task doesnt go green until all sub tasks are green, and if things go purple for review, i respond to each purple"

### 2.2 Rollup semantics — LOCKED per §1.6.2

See §1.6.2 for the authoritative rules. Summary:

| Severity (highest first) | Status | UI intent |
|---|---|---|
| 1 · `blocked` | `blocked` | Red — something is stuck, look at this |
| 2 · `in_review` | `in_review` | Purple — needs user action |
| 3 · `in_progress` | `in_progress` | Orange/yellow — work is happening |
| 4 · `todo` / `backlog` | queued | Blue — nothing to do yet |
| 5 · `done` | `done` | Green — fully shipped |
| — | `cancelled` | Ignored for rollup |

Rules (all locked):

- `rolledUpStatus` is the **highest severity** among the parent's own status AND every descendant in the response set.
- **`done` is only produced when every non-cancelled descendant — recursively — is `done` AND the parent itself is `done`.** This is the user's explicit requirement ("parent doesn't go green until all subtasks are green").
- `cancelled` descendants are excluded from aggregation entirely — they neither block `done` nor contribute severity.
- Leaves (no descendants in response set) have `rolledUpStatus === status`.
- Cycle protection: reuse the depth-10 + visited-set pattern from Step 1.

Aggregation is **recursive over the full descendant closure**, not just direct children. The parent's stored `status` in the DB is never mutated; `rolledUpStatus` is a computed response-only field.

**Future enhancement (explicitly OUT OF SCOPE for Step 2):** per-parent opt-out of the strict "all children must be done" rule, for cases where a parent is considered complete even if some subtasks remain open. Leave a `TODO(rollup-opt-out):` marker in the service so it's findable, but do not implement.

### 2.3 Server vs client — where to compute

**Recommendation: compute server-side inside `svc.list()` when `includeAncestors: true`.**

Pros:
- Single source of truth — any API consumer (UI, MCP tool, mobile client) sees the same aggregate.
- Works uniformly for both "assigned parents" and "ancestor headers" without branching logic.
- Uses data the service already has in memory — all rows are already fetched; we just post-process.

Cons:
- Adds response payload (one extra field per row).
- Requires threading the `inboxRole` + `parentId` map through the enrichment pipeline.

**Alternative: compute client-side in `buildInboxNesting()`** — cheaper, but drifts from API truth. Only choose this if Step 3 wants to use the rollup for agent-level decisions independently, in which case the server MUST have it.

Decision: **server-side, first-class response field.**

### 2.4 Response shape

Add a new optional field on `Issue` type (`packages/shared/src/types/issue.ts`):

```ts
rolledUpStatus?: IssueStatus; // present only when includeAncestors=true
```

When `includeAncestors=true`, every returned row gets:

- `inboxRole`: `"assigned" | "ancestor"` (already exists)
- `rolledUpStatus`: the severity-min of `row.status` and every descendant in the **returned set** (not every descendant in the DB — we only aggregate what's visible)

**Important scoping decision:** aggregation uses **only the issues present in the response**, not a full DB sweep. A parent's rollup reflects "the aggregate state of your visible work". If children exist but aren't in the inbox (wrong status, hidden, archived), they don't influence the rollup.

### 2.5 Implementation plan — 4 slices

#### Slice A — Server: compute `rolledUpStatus` in `svc.list()`

- File: `server/src/services/issues.ts` inside the `list()` method.
- After merging `enrichedBase + enrichedAncestors`, build a map of `id → status` for every row in the combined set.
- Build a reverse adjacency: `parentId → child IDs present in response`.
- For each parent row (assigned OR ancestor), walk its subtree in the in-memory adjacency and compute `rolledUpStatus` via severity-min. Iterative post-order with memoization — single pass.
- Only add `rolledUpStatus` when `filters.includeAncestors === true`. Omit the field otherwise.
- **Cycle guard:** Reuse the same depth-10 / visited set pattern from Step 1.

Acceptance checks (add to `server/src/__tests__/issues-service-ancestors.test.ts`):

1. Parent with 3 children (1 in_progress, 2 todo) → `rolledUpStatus === "in_progress"`.
2. Parent with 1 child in `blocked` and 2 in `done` → `rolledUpStatus === "blocked"`.
3. Parent with all 3 children `done` (and parent itself `done`) → `rolledUpStatus === "done"`.
4. Parent with 1 child `in_review`, 1 `done`, 1 `in_progress` → `rolledUpStatus === "in_review"` (in_review outranks in_progress per severity table).
5. 3-level chain: grandparent's rollup reflects the **deepest** descendant, not just direct children.
6. Parent with no descendants in the returned set → `rolledUpStatus === parent.status`.
7. `includeAncestors=false` → `rolledUpStatus` omitted from every row.
8. Cancelled child → ignored for rollup (or alternative semantics if the user specifies).

#### Slice B — UI: display rolled-up status on parents

- File: `ui/src/pages/Inbox.tsx` + `ui/src/components/IssueRow.tsx` (or wherever the `StatusIcon` is rendered in the row).
- When `issue.rolledUpStatus` is defined and **differs from `issue.status`**, render the rolled-up status icon in the leading position, and render the parent's own stored `status` as a **smaller secondary indicator** (or omit, depending on clarity).
- Hover/tooltip: show "Rolled up from N sub-tasks" with the breakdown if we can fit it.
- For leaves (no `rolledUpStatus` or same as own status), render exactly as today.

Acceptance checks:

- Playwright smoke: a parent with 3 in_progress children renders an `in_progress` icon even when the parent's stored status is `todo`.
- Unit test on `IssueRow` with `rolledUpStatus` prop: renders the rolled-up icon, tooltip shows "N sub-tasks".
- Visual regression: ancestor header rows show the correct rolled-up icon.

#### Slice C — Tests and Playwright smoke extension

- Extend `scripts/inbox-nesting-smoke.ts` to also capture the rendered status icon per row and assert they match the server's `rolledUpStatus`.
- Extend `server/scripts/seed-nesting-demo.ts` to include a scenario where the rollup is clearly visible (parent `todo`, children mixed `in_progress` + `blocked`).

#### Slice D — Codex second-opinion review

- Skill: `codex-spark` with verdict format.
- Focus areas: severity ordering correctness, cycle handling, performance (O(n) where n = response size).

### 2.6 Open questions for Step 2

Resolved (locked in §1.6.2):
- ~~Cancelled children~~ → **ignored entirely**.
- ~~"All children must be done for parent green"~~ → **confirmed, this is the rule**. Future opt-out is a separate enhancement.
- ~~Severity ordering~~ → **blocked > in_review > in_progress > todo/backlog > done**.

Still open — ask the user or make a pragmatic default:
1. **Display when rolled-up == own status**: show nothing special, or always show a "rolled up from N" indicator regardless? *Default: show the icon only when it differs from own status; tooltip always shows "N sub-tasks".*
2. **Rolled-up on leaf rows**: send `rolledUpStatus === status` for uniform typing, or omit the field? *Default: send it for uniformity — the UI can short-circuit when they're equal.*
3. **Sort order**: does a `blocked` rollup float the parent higher in the inbox? *Default: no — preserve existing sort order for Step 2, revisit later.*

---

## 3. Step 3 — CEO gates review ("wait until ready")

### 3.1 Goal

Stop per-child notifications for delegated work. Instead, the delegating agent (typically the CEO) **suppresses child-level user notifications while it's actively managing the delegation**, and emits **one aggregated "ready for review" signal** only when every descendant is in a terminal-ish state (all `done`, or any mix of `done` / `in_review` / `blocked` — basically "no child is actively in progress anymore").

User quote:

> "the CEO waits until all sub tasks are at a state where theyre green/purple/red, then asks me to review"

### 3.2 Behavior change

Current behavior: every time a child task transitions state (assignment, status change, comment-wake), the system raises wakeup / notification signals via `queueIssueAssignmentWakeup` (`server/src/services/issue-assignment-wakeup.ts`) and similar heartbeat mechanisms. Each child independently generates user-visible "unread" state and inbox pings.

Target behavior:

1. When a CEO delegates a task (creates child issues with `parentId`), the CEO's heartbeat is the source-of-truth for when the PARENT needs human attention.
2. While any descendant is still `todo` or `in_progress`, the CEO's parent issue stays in a "managing" state and does NOT generate a user-facing "ready for review" signal.
3. Once **every descendant** is in `done` or `in_review` or `blocked` (in other words: nothing is actively progressing), the CEO's heartbeat emits a single "parent is ready for your review" wake signal targeted at the human user.
4. The user sees **one** inbox item become urgent (purple / unread / highlighted), not N.

### 3.3 Design — LOCKED to Design A per §1.6.3

**Design A (derived state, no schema change).** The "is this parent still managing children?" signal is computed on demand by walking the DB. No new column, no new migration, no new persistent flag.

Step 3 MUST implement its own `isManagingChildren(parentId)` helper that does its own recursive CTE. It MUST NOT depend on Step 2's `rolledUpStatus` field, because Step 2 and Step 3 are developed in parallel and Step 3 cannot assume Step 2 is merged.

After both steps land, a follow-up commit MAY simplify `isManagingChildren` to read `rolledUpStatus` directly when the caller already has it. That's a post-merge optimization, not part of Step 3 itself.

**Design B (explicit `awaiting_review` column) is rejected** for this iteration. If a future feature needs persistent state for cross-agent coordination, revisit then.

### 3.4 Where to implement

Relevant files to investigate:

- `server/src/onboarding-assets/ceo/AGENTS.md` — the CEO skill prompt that already tells agents to set `parentId` on delegated subtasks. Extend it to include a "wait for all children" rule.
- `server/src/services/issue-assignment-wakeup.ts` (referenced at `server/src/routes/issues.ts:58`) — entry point for assignment wakeups. Gate these on rollup state when a parent has descendants.
- `server/src/services/heartbeat-*.ts` (find exact path) — CEO heartbeat logic. Add a per-tick check: "if I have delegated children, don't signal ready-for-review until all are terminal".
- `server/src/services/notifications.*` or the inbox `issueReadStates` / badge path — suppress unread marking on parent rows while managing.

### 3.5 Implementation plan — 4 slices

#### Slice A — Server: introduce `isManagingChildren(parentId)` helper

- New helper `server/src/services/issue-management.ts` exporting `async isManagingChildren(db, parentId): Promise<boolean>`.
- Returns `true` if the parent has at least one descendant in `todo` or `in_progress`.
- Reuses the same recursive CTE pattern from Step 1 (bounded depth, company-scoped).
- Tests: descendants all terminal → false; any descendant in_progress → true; 3-level chain with deep grandchild in_progress → true.

#### Slice B — Server: gate wakeups and notifications on `isManagingChildren`

- Wherever the CEO parent would generate a wake / unread / notification signal, call `isManagingChildren`.
- If true, drop/defer the signal and log at debug level: `"suppressed parent ready-for-review wake — N descendants still in_progress"`.
- If false, emit exactly one ready-for-review wake targeted at the parent's assignee (the CEO, not the user) — the CEO then decides whether to hand to the user.

#### Slice C — CEO skill prompt update

- File: `server/src/onboarding-assets/ceo/AGENTS.md`
- Add: "When you delegate work via parentId children, do not mark your parent task ready for human review until every descendant is in `done`, `in_review`, or `blocked`. You may comment on the parent with a progress summary at any time, but the user-facing 'needs review' signal must wait."
- Tests: snapshot test on the AGENTS.md content including this rule.

#### Slice D — UI: respect the new signal

- If Step 3 sticks with Design A (derived), UI already shows the rolled-up status from Step 2 and there may be nothing to change here.
- If Design B is chosen, `Inbox.tsx` needs to add a "Ready for review" badge on parent rows where `awaitingReview === true`, and bump sort priority accordingly.
- Playwright smoke: after the CEO processes all children to `done`, the parent row shows a "Ready for review" treatment.

### 3.6 Open questions for Step 3

Resolved (locked in §1.6):
- ~~Design A vs B~~ → **Design A, no schema change**.
- ~~What counts as "actively in progress"?~~ → `todo, in_progress, backlog` are **active**; `in_review, blocked, done, cancelled` are **terminal**. See §1.6.1.
- ~~Multi-level delegation~~ → CEO waits for the **full transitive closure**. Every leaf must be terminal, at any depth. Reuses the same recursive CTE as Step 1.

Still open — ask the user or make a pragmatic default:
1. **Comments and mentions**: should a user-to-CEO comment still bypass the suppression and wake the CEO immediately? *Default: yes — direct human-to-agent communication always bypasses. Gating applies only to the automatic descendant-state wake signals.*
2. **Race condition on the "last child transition" event**: CEO's heartbeat fires every ~30s. If all children transition terminal and the next heartbeat is 29s away, the user waits. *Default: on the transition that flips the descendant closure from "any active" to "all terminal", enqueue an immediate heartbeat wake for the parent's CEO. Do NOT wait for the next tick.*
3. **Cancellation cascade**: if the user manually cancels the parent while the CEO is managing, what happens to outstanding children? *Default: leave children alone (don't cascade cancellation). Log a warning. The user can cancel children individually if they want.*

---

## 4. Pipeline — parallel execution

### Who does what

**Session 1 — owns Step 2 (parent status rollup).** Reads §1.6, §2. Executes:

```
Slice A — server:   compute rolledUpStatus in svc.list()
Slice B — UI:       display rolled-up icon in IssueRow / Inbox row
Slice C — tests:    extend issues-service-ancestors.test.ts + Playwright smoke
Slice D — review:   codex-spark or codex:rescue on the diff
→ commit, push branch, flag ready for merge
```

**Session 2 — owns Step 3 (CEO gates review).** Reads §1.6, §3. Executes:

```
Slice A — server:   new isManagingChildren helper (own CTE, own tests)
Slice B — server:   gate wakeups / notifications in issue-assignment-wakeup
Slice C — prompts:  extend server/src/onboarding-assets/ceo/AGENTS.md
Slice D — UI:       NOTHING REQUIRED for Design A (skip unless blocked)
→ commit, push branch, flag ready for merge
```

### Hard rules for both sessions

1. **Step 1 is already on `master` (committed or about to be — verify before you start).** Do not touch Step 1's code.
2. **Obey §1.6 file ownership.** If §1.6.4 doesn't list a file as yours, do not edit it.
3. **No cross-dependencies.** Step 3 does NOT read `issue.rolledUpStatus`. Step 2 does NOT reference `isManagingChildren`. They meet only in the shared truth table (§1.6.1).
4. **Run the shared acceptance gate (§1.6.6) before declaring done.** All four commands must pass.
5. **Commit order: Step 2 first, then Step 3 rebases.** If Step 3 finishes first, wait for Step 2 to land, then rebase. Do not merge Step 3 onto a pre-Step-2 master.
6. **If either session finds a rule in §1.6 wrong or incomplete**, stop immediately, flag it, and do NOT proceed until the contract is updated by the user.

---

## 5. How to run everything locally (copy-paste)

```bash
cd /path/to/PaperClip-Fork
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

# Install (one-time or after branch change)
pnpm install

# Start dev server (embedded pg, single port 3100)
pnpm dev

# Seed demo scenarios for manual/Playwright verification
pnpm --filter @paperclipai/server exec tsx ./scripts/seed-nesting-demo.ts

# Run full test suite
pnpm test:run

# Run just the ancestor-nesting server tests
pnpm --filter @paperclipai/server exec vitest run src/__tests__/issues-service-ancestors.test.ts

# Run the Playwright smoke harness (headless — confirms row kind/indent/bg)
pnpm --filter @paperclipai/server exec tsx ../scripts/inbox-nesting-smoke.ts

# Typecheck
pnpm --filter @paperclipai/server typecheck
pnpm --filter @paperclipai/ui typecheck
pnpm --filter @paperclipai/shared typecheck
```

Node 22 is pinned via the keg-only Homebrew install because pnpm 9.15.x crashes on Node 24. The `PATH` export is **required** in any new shell before running `pnpm`.

---

## 6. Known gotchas for whoever picks this up

1. **Browser cache is sticky.** When iterating on `Inbox.tsx`, the dev server's Vite HMR serves fresh JS but browsers can cling to old modules. If you see weird behavior after an edit, verify with `curl http://127.0.0.1:3100/src/pages/Inbox.tsx | grep <your-change>` and hard-refresh with cache disabled (or use the Playwright smoke script which always starts fresh).
2. **Embedded Postgres lock file.** If the dev server crashes mid-start, `~/.paperclip/instances/default/db/postmaster.pid` can be stale. Delete it and kill any lingering postgres processes on port 54329 before restarting.
3. **Dev server is managed by a daemon** (`pnpm dev:stop` then `pnpm dev` if it says "already running"). If the daemon is confused, `ps aux | grep dev-watch` and hand-kill the pids.
4. **`issueService.create` rejects dual assignee** (agent + user on the same issue). Seed scripts should pick one.
5. **`FK constraint on issue_comments`** means you can't hard-delete issues that have comments — use `update ... set hiddenAt = now()` to soft-delete for demos.
6. **`better-auth` session cookie** — grab it from the server logs (`~/.paperclip/instances/default/logs/server.log`) if you need to `curl` the authenticated API directly.

---

## 7. Links to the diff landing

When Step 1 is committed, these are the key symbols to search for to find the code:

- `includeAncestors` — add/remove the flag in API surface
- `inboxRole` — the "assigned" | "ancestor" tag
- `WITH RECURSIVE ancestors` — the CTE in `server/src/services/issues.ts`
- `asHeader` — the `IssueRow` non-clickable variant
- `loadInboxCollapsedParents` / `saveInboxCollapsedParents` — the localStorage helpers
- `MAX_INBOX_NESTING_DEPTH` — the depth guard (currently 10)
- `appendDescendantsForNav` — the recursive flat-nav builder (for keyboard traversal)
- `indexChildrenRecursively` — the recursive flat-index builder (for navigation index)
- `renderDescendants` — the recursive render loop inside `Inbox.tsx`

---

**End of spec.**
