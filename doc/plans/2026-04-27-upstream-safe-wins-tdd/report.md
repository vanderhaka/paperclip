# TDD Report: upstream-safe-wins

## Implemented

1. Preserved absolute Paperclip/GitHub links in markdown while keeping relative issue references clickable.
2. Fixed older issue comment loading with cursor-safe server pagination plus capped chat-view prefetch.
3. Added default CLI JSON redaction for agent secrets, with explicit `--show-secrets` escape hatches.
4. Added heartbeat concurrency regression coverage so low `maxConcurrentRuns` values stay valid.
5. Centralized local adapter workspace env propagation and updated CEO onboarding notes to use `$AGENT_HOME`.
6. Made new-agent heartbeat demand config quieter while preserving legacy missing-config behavior and manual on-demand invokes.
7. Stopped idle timer heartbeats from creating/extending synthetic `__heartbeat__` task sessions.

## Verification Summary

The repo handoff checks passed: `pnpm -r typecheck`, `pnpm test:run`, and `pnpm build`. All targeted tests and package typechecks listed in `qa-review.md` passed, except direct Vitest execution of the new adapter-utils unit test is blocked by the existing root Vitest project configuration. The adapter-utils package and all touched adapters passed TypeScript verification.

## Follow-Up Candidates

- Add `packages/adapter-utils` to root `vitest.config.ts` in a separate small cleanup so its new unit test runs with the standard workspace test command.
- Re-review heartbeat wake defaults after live usage, especially assignment/automation wake expectations for newly hired agents.
