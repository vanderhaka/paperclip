import { describe, expect, it } from "vitest";
import {
  applyEmployeeModelPolicy,
  EMPLOYEE_MODEL_POLICY_ADAPTER_TYPE,
  EMPLOYEE_MODEL_POLICY_MODEL,
  EMPLOYEE_MODEL_POLICY_THINKING,
} from "../services/agents.js";

const jarve = { name: "JARVE", issuePrefix: "JARA" };
const newJarveCompany = { name: "JARVE", issuePrefix: "JAR" };
const otherCompany = { name: "Other", issuePrefix: "OTH" };

describe("employee model policy", () => {
  it("forces JARVE agent creation onto DeepSeek V4 via Pi", () => {
    const result = applyEmployeeModelPolicy(jarve, {
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

  it("forces newly-created JARVE companies onto DeepSeek V4 via Pi", () => {
    const result = applyEmployeeModelPolicy(newJarveCompany, {
      name: "Engineer",
      role: "engineer",
      adapterType: "codex_local",
      adapterConfig: {
        model: "gpt-5.5",
      },
    });

    expect(result.adapterType).toBe(EMPLOYEE_MODEL_POLICY_ADAPTER_TYPE);
    expect(result.adapterConfig).toMatchObject({
      model: EMPLOYEE_MODEL_POLICY_MODEL,
      thinking: EMPLOYEE_MODEL_POLICY_THINKING,
    });
  });

  it("keeps non-JARVE companies with a JAR prefix unchanged", () => {
    const result = applyEmployeeModelPolicy({ name: "Jar Tools", issuePrefix: "JAR" }, {
      adapterType: "codex_local",
      adapterConfig: { model: "gpt-5.5" },
    });

    expect(result).toEqual({
      adapterType: "codex_local",
      adapterConfig: { model: "gpt-5.5" },
    });
  });

  it("repairs explicit adapter updates for JARVE agents", () => {
    const result = applyEmployeeModelPolicy(
      jarve,
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

  it("leaves unrelated updates alone when the existing JARVE agent is compliant", () => {
    const result = applyEmployeeModelPolicy(
      jarve,
      { name: "Renamed CEO" },
      {
        adapterType: "pi_local",
        adapterConfig: { model: EMPLOYEE_MODEL_POLICY_MODEL, thinking: "medium" },
      },
    );

    expect(result).toEqual({ name: "Renamed CEO" });
  });

  it("does not apply outside the enforced company", () => {
    const result = applyEmployeeModelPolicy(otherCompany, {
      adapterType: "codex_local",
      adapterConfig: { model: "gpt-5.5" },
    });

    expect(result).toEqual({
      adapterType: "codex_local",
      adapterConfig: { model: "gpt-5.5" },
    });
  });
});
