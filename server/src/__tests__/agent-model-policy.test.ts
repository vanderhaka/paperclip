import { describe, expect, it } from "vitest";
import {
  applyEmployeeModelPolicy,
  DEFAULT_AGENT_HIRING_POLICY,
  EMPLOYEE_MODEL_POLICY_ADAPTER_TYPE,
  EMPLOYEE_MODEL_POLICY_MODEL,
  EMPLOYEE_MODEL_POLICY_THINKING,
  normalizeAgentHiringPolicy,
} from "../services/agents.js";

const company = { name: "JARVE", issuePrefix: "JARA", agentHiringPolicy: null };

describe("employee model policy", () => {
  it("forces agent creation onto the default DeepSeek V4 Pi policy", () => {
    const result = applyEmployeeModelPolicy(company, {
      name: "Engineer",
      role: "engineer",
      adapterType: "codex_local",
      adapterConfig: {
        cwd: "/work",
        model: "gpt-5.5",
      },
    });

    expect(result.adapterType).toBe(EMPLOYEE_MODEL_POLICY_ADAPTER_TYPE);
    expect(result.adapterConfig).toMatchObject({
      cwd: "/work",
      model: EMPLOYEE_MODEL_POLICY_MODEL,
      thinking: EMPLOYEE_MODEL_POLICY_THINKING,
    });
  });

  it("repairs explicit adapter updates with the default DeepSeek V4 Pi policy", () => {
    const result = applyEmployeeModelPolicy(
      company,
      {
        adapterType: "opencode_local",
        adapterConfig: { model: "openai/gpt-5.2-codex", thinking: "high" },
      },
      {
        adapterType: "pi_local",
        adapterConfig: { cwd: "/work", model: EMPLOYEE_MODEL_POLICY_MODEL },
      },
    );

    expect(result.adapterType).toBe(EMPLOYEE_MODEL_POLICY_ADAPTER_TYPE);
    expect(result.adapterConfig).toMatchObject({
      cwd: "/work",
      model: EMPLOYEE_MODEL_POLICY_MODEL,
      thinking: "high",
    });
  });

  it("leaves unrelated updates alone when the existing agent is compliant", () => {
    const result = applyEmployeeModelPolicy(
      company,
      { name: "Renamed CEO" },
      {
        adapterType: "pi_local",
        adapterConfig: { model: EMPLOYEE_MODEL_POLICY_MODEL, thinking: "medium" },
      },
    );

    expect(result).toEqual({ name: "Renamed CEO" });
  });

  it("uses the default hiring policy for companies without an explicit override", () => {
    const result = applyEmployeeModelPolicy({ name: "Other", issuePrefix: "OTH", agentHiringPolicy: null }, {
      adapterType: "codex_local",
      adapterConfig: { model: "gpt-5.5" },
    });

    expect(result.adapterType).toBe(DEFAULT_AGENT_HIRING_POLICY.defaultAdapterType);
    expect(result.adapterConfig).toMatchObject({
      model: EMPLOYEE_MODEL_POLICY_MODEL,
    });
  });

  it("allows a configurable policy to opt out of adapter enforcement except disallowed adapters", () => {
    const relaxedCompany = {
      name: "Flexible",
      issuePrefix: "FLE",
      agentHiringPolicy: {
        enforceAdapterDefaults: false,
        defaultAdapterType: "pi_local",
        defaultAdapterConfig: { model: "deepseek/deepseek-v4-pro", thinking: "medium" },
        disallowedAdapterTypes: ["openclaw_gateway"],
      },
    };

    expect(applyEmployeeModelPolicy(relaxedCompany, {
      adapterType: "codex_local",
      adapterConfig: { model: "gpt-5.5" },
    })).toEqual({
      adapterType: "codex_local",
      adapterConfig: { model: "gpt-5.5" },
    });

    const disallowed = applyEmployeeModelPolicy(relaxedCompany, {
      adapterType: "openclaw_gateway",
      adapterConfig: { url: "wss://example.test" },
    });
    expect(disallowed.adapterType).toBe("pi_local");
  });

  it("normalizes partial policy configuration with safe defaults", () => {
    expect(normalizeAgentHiringPolicy({ enforceAdapterDefaults: false })).toMatchObject({
      defaultAdapterType: "pi_local",
      enforceAdapterDefaults: false,
      disallowedAdapterTypes: ["openclaw_gateway"],
    });
  });
});
