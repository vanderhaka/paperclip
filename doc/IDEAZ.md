# Paperclip Fork Ideaz

Date: 2026-04-27

These are feature ideas for making this fork easier to operate as James' hosted AI-company control plane. The priority is practical: less dashboard hunting, clearer CEO steering, better mobile operation, safer autonomy, and fewer surprise costs.

## 1. CEO Chat Home Screen

Build a first-class command surface for talking to the CEO without immediately turning every thought into an issue. The operator should be able to brainstorm, ask what is going on, collect context, and then explicitly promote a message into an issue when it becomes executable.

Why it helps: Paperclip already anchors real work to issues, comments, goals, approvals, and runs. This feature keeps that invariant while making the first operator action feel natural: talk to the CEO, then convert the useful part into work.

## 2. Mobile Command Inbox

Create one phone-friendly page for the board operator's next decisions: CEO chat, approvals, unread inbox items, live runs, blocked tasks, and quick issue creation.

Why it helps: hosted Paperclip is most useful when James can check it from a phone and immediately see what needs attention. It reduces the need to bounce between dashboard, inbox, approvals, agents, and issues.

## 3. One-Click Company Templates

Support curated company templates for agency, engineering, research, marketing, and operations teams.

Why it helps: reusable templates make it fast to spin up useful crews without manually building every agent, skill, project, and initial task.

## 4. Import Template Preview

Before importing a company, show the agents, skills, budgets, projects, and initial tasks that will be created.

Why it helps: large templates are powerful but risky. A preview makes imports understandable and prevents accidental over-hiring.

## 5. Agent Cost Governor

Add plain-English spend forecasts per agent and company, based on heartbeat schedule, recent runs, adapter, and model.

Why it helps: budgets stop runaway spend after the fact. Forecasts help prevent it before it happens.

## 6. Heartbeat Kill Switch And Schedule Presets

Add simple heartbeat modes such as Paused, Cheap, Normal, Aggressive, and Night Only.

Why it helps: operators should not need to tune every interval and concurrency setting just to keep costs sensible.

## 7. Dependency-Aware Task Planning

Make task dependencies more visible and wake agents when blockers clear.

Why it helps: agent teams become less chaotic when tasks wait for real prerequisites instead of running early and failing.

## 8. Approval Queue With Decision Summaries

Summarize each approval request as what is requested, why it matters, cost/risk, and recommended decision.

Why it helps: the board can make faster decisions from phone without opening several detail views.

## 9. Agent Hiring Guardrails

Require role, manager, budget, adapter, purpose, and termination condition before approving a new agent.

Why it helps: agent hiring stays deliberate and cheap instead of leaving behind confusing paused agents.

## 10. Run Transcript Digest

Show a human-readable digest above every run: goal, actions taken, files touched, blockers, result, and next step.

Why it helps: raw logs are necessary for debugging, but the default view should answer what happened without making the operator read terminal output.

## 11. Unified Search

Search issues, comments, documents, runs, agents, and approvals from one box.

Why it helps: Paperclip quickly becomes company memory. Search should answer "where did we decide that?" instantly.

## 12. Output Library

Create a deliverables tab per company/project for files, docs, reports, screenshots, previews, and links.

Why it helps: completed work should be visible as output, not buried in issue comments or run logs.

## 13. Workspace Health Checks

Before an agent runs, validate cwd, git state, keys, model availability, permissions, and writable runtime paths.

Why it helps: many failed runs are environment problems. Preflight checks make failures clear before token spend starts.

## 14. Adapter Marketplace And Config Wizard

Make Codex, DeepSeek/OpenRouter, Claude, Gemini, HTTP, process, and external plugins wizard-driven.

Why it helps: provider setup is friction. A guided adapter setup makes agent hiring less brittle.

## 15. Agent Memory And Instruction Recovery UI

Show each agent's instructions, managed files, skills, memory sources, and last successful context sync.

Why it helps: when an agent acts strangely, the operator needs to inspect what it actually knew.

## 16. Routine Builder

Add friendly recurring recipes: daily CEO brief, weekly market scan, cost report, cleanup stale tasks, GitHub issue triage.

Why it helps: recurring work is where autonomous companies become useful. Recipes make routines accessible.

## 17. Company Activity Timeline

Show one chronological feed of wakes, runs, approvals, comments, issues, budget pauses, and deliverables.

Why it helps: the operator gets a "what happened while I was away?" view.

## 18. Agent Scorecards

Track completion rate, cost per completed task, blockers, useful output count, and recent failure reasons.

Why it helps: it becomes obvious which agents are valuable, expensive, stuck, or should be paused.

## 19. Safe Hosted Admin Reset Tools

Add backup, pause agents, wipe tasks/runs, clear wakeups, verify counts, and restore guidance in one admin screen.

Why it helps: hosted cleanup should be repeatable and safe, not ad hoc database surgery.

## 20. Guided First Five Minutes

Seed a useful CEO task and walk a new operator directly to the first completed result.

Why it helps: the product should prove value quickly: one company, one CEO, one visible result.
