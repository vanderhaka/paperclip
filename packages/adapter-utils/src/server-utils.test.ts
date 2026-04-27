import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { applyPaperclipWorkspaceEnv, runChildProcess } from "./server-utils.js";

function isPidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForPidExit(pid: number, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !isPidAlive(pid);
}

describe("applyPaperclipWorkspaceEnv", () => {
  it("adds shared workspace env vars including AGENT_HOME", () => {
    const env = applyPaperclipWorkspaceEnv(
      {},
      {
        workspaceCwd: "/tmp/workspace",
        workspaceSource: "project_primary",
        workspaceStrategy: "git_worktree",
        workspaceId: "workspace-1",
        workspaceRepoUrl: "https://github.com/vanderhaka/paperclip.git",
        workspaceRepoRef: "master",
        workspaceBranch: "feature/test",
        workspaceWorktreePath: "/tmp/worktree",
        agentHome: "/tmp/agent-home",
      },
    );

    expect(env).toEqual({
      PAPERCLIP_WORKSPACE_CWD: "/tmp/workspace",
      PAPERCLIP_WORKSPACE_SOURCE: "project_primary",
      PAPERCLIP_WORKSPACE_STRATEGY: "git_worktree",
      PAPERCLIP_WORKSPACE_ID: "workspace-1",
      PAPERCLIP_WORKSPACE_REPO_URL: "https://github.com/vanderhaka/paperclip.git",
      PAPERCLIP_WORKSPACE_REPO_REF: "master",
      PAPERCLIP_WORKSPACE_BRANCH: "feature/test",
      PAPERCLIP_WORKSPACE_WORKTREE_PATH: "/tmp/worktree",
      AGENT_HOME: "/tmp/agent-home",
    });
  });

  it("skips empty workspace env values", () => {
    const env = applyPaperclipWorkspaceEnv(
      {},
      {
        workspaceCwd: "",
        workspaceSource: null,
        agentHome: "",
      },
    );

    expect(env).toEqual({});
  });
});

describe("runChildProcess", () => {
  it("waits for onSpawn before sending stdin to the child", async () => {
    const spawnDelayMs = 150;
    const startedAt = Date.now();
    let onSpawnCompletedAt = 0;

    const result = await runChildProcess(
      randomUUID(),
      process.execPath,
      [
        "-e",
        "let data='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>data+=chunk);process.stdin.on('end',()=>process.stdout.write(data));",
      ],
      {
        cwd: process.cwd(),
        env: {},
        stdin: "hello from stdin",
        timeoutSec: 5,
        graceSec: 1,
        onLog: async () => {},
        onSpawn: async () => {
          await new Promise((resolve) => setTimeout(resolve, spawnDelayMs));
          onSpawnCompletedAt = Date.now();
        },
      },
    );
    const finishedAt = Date.now();

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello from stdin");
    expect(onSpawnCompletedAt).toBeGreaterThanOrEqual(startedAt + spawnDelayMs);
    expect(finishedAt - startedAt).toBeGreaterThanOrEqual(spawnDelayMs);
  });

  it.skipIf(process.platform === "win32")("kills descendant processes on timeout via the process group", async () => {
    let descendantPid: number | null = null;

    const result = await runChildProcess(
      randomUUID(),
      process.execPath,
      [
        "-e",
        [
          "const { spawn } = require('node:child_process');",
          "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
          "process.stdout.write(String(child.pid));",
          "setInterval(() => {}, 1000);",
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: {},
        timeoutSec: 1,
        graceSec: 1,
        onLog: async () => {},
        onSpawn: async () => {},
      },
    );

    descendantPid = Number.parseInt(result.stdout.trim(), 10);
    expect(result.timedOut).toBe(true);
    expect(Number.isInteger(descendantPid) && descendantPid > 0).toBe(true);

    expect(await waitForPidExit(descendantPid!, 2_000)).toBe(true);
  });
});
