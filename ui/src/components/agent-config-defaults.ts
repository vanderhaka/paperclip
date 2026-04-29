import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";
import { DEFAULT_PI_LOCAL_MODEL } from "@paperclipai/adapter-pi-local";

export const defaultCreateValues: CreateConfigValues = {
  adapterType: "pi_local",
  cwd: "",
  instructionsFilePath: "",
  promptTemplate: "",
  model: DEFAULT_PI_LOCAL_MODEL,
  thinkingEffort: "medium",
  chrome: false,
  dangerouslySkipPermissions: true,
  search: false,
  fastMode: false,
  dangerouslyBypassSandbox: false,
  command: "",
  args: "",
  extraArgs: "",
  envVars: "",
  envBindings: {},
  url: "",
  bootstrapPrompt: "",
  payloadTemplateJson: "",
  workspaceStrategyType: "project_primary",
  workspaceBaseRef: "",
  workspaceBranchTemplate: "",
  worktreeParentDir: "",
  runtimeServicesJson: "",
  maxTurnsPerRun: 1000,
  heartbeatEnabled: false,
  intervalSec: 300,
};

export function createDefaultValuesForAdapterType(
  adapterType: CreateConfigValues["adapterType"],
): CreateConfigValues {
  const nextValues: CreateConfigValues = {
    ...defaultCreateValues,
    adapterType,
    model: "",
    thinkingEffort: "",
    dangerouslyBypassSandbox: false,
  };

  if (adapterType === "codex_local") {
    nextValues.model = DEFAULT_CODEX_LOCAL_MODEL;
    nextValues.dangerouslyBypassSandbox =
      DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX;
  } else if (adapterType === "gemini_local") {
    nextValues.model = DEFAULT_GEMINI_LOCAL_MODEL;
  } else if (adapterType === "cursor") {
    nextValues.model = DEFAULT_CURSOR_LOCAL_MODEL;
  } else if (adapterType === "pi_local") {
    nextValues.model = DEFAULT_PI_LOCAL_MODEL;
    nextValues.thinkingEffort = "medium";
  }

  return nextValues;
}
