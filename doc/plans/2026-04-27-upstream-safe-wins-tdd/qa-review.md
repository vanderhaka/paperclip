# QA Review: upstream-safe-wins

## Scope

- Implemented the accepted safe small wins and good-but-careful items from the upstream review.
- Kept changes local to link parsing, issue comments, CLI redaction, heartbeat policy/session handling, adapter env propagation, and CEO onboarding text.

## Risk Notes

- Absolute Paperclip links: low risk. The change only stops internal issue-link parsing for `http(s)` URLs and keeps relative issue links normalized.
- Comment pagination: medium risk. Server cursor logic moved from raw SQL to Drizzle predicates and UI can auto-fetch up to three pages in chat view. The cap avoids unbounded loops.
- CLI redaction: low/medium risk. Defaults are safer, and `--show-secrets` is available for explicit debugging. The heuristic may redact some non-secret long tokens in JSON output, which is acceptable for a secret-safe default.
- Heartbeat demand defaults: medium risk. New agent runtime config is quieter by default for assignment/automation wakes, while legacy agents with missing heartbeat config preserve previous behavior. Manual `on_demand` invokes still run, so operator controls are not blocked.
- Idle heartbeat sessions: medium risk. Timer wakes without issue/task context no longer persist `__heartbeat__` task sessions. Runs with explicit issue/task context keep session continuity.
- Adapter env helper: low risk. Centralizes existing env names and preserves each adapter's previous effective workspace cwd choice.

## Verification

- `pnpm -r typecheck`
- `pnpm test:run`
- `pnpm build`
- `pnpm exec vitest run ui/src/lib/issue-reference.test.ts ui/src/components/MarkdownBody.test.tsx ui/src/lib/optimistic-issue-comments.test.ts cli/src/__tests__/client-redaction.test.ts`
- `pnpm --filter @paperclipai/server exec vitest run src/__tests__/issues-service.test.ts`
- `pnpm --filter @paperclipai/server exec vitest run src/__tests__/heartbeat-policy.test.ts src/__tests__/heartbeat-workspace-session.test.ts`
- `pnpm --filter @paperclipai/server exec vitest run src/__tests__/heartbeat-policy.test.ts src/__tests__/heartbeat-comment-wake-batching.test.ts`
- `pnpm exec vitest run ui/src/lib/new-agent-runtime-config.test.ts`
- `pnpm --filter @paperclipai/adapter-utils typecheck`
- `pnpm --filter @paperclipai/adapter-claude-local typecheck`
- `pnpm --filter @paperclipai/adapter-codex-local typecheck`
- `pnpm --filter @paperclipai/adapter-cursor-local typecheck`
- `pnpm --filter @paperclipai/adapter-gemini-local typecheck`
- `pnpm --filter @paperclipai/adapter-opencode-local typecheck`
- `pnpm --filter @paperclipai/adapter-pi-local typecheck`
- `pnpm --filter @paperclipai/server typecheck`
- `pnpm --filter @paperclipai/ui typecheck`
- `pnpm --filter paperclipai typecheck`

## Known Test Harness Quirk

- `packages/adapter-utils/src/server-utils.test.ts` was added, but the standard `pnpm test:run` suite does not execute it because the root `vitest.config.ts` project list does not include `packages/adapter-utils`. Direct Vitest execution from that package is also blocked because Vitest resolves the root projects relative to the package directory. Typecheck passed for the package and all touched adapters.
