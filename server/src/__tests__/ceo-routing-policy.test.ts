import { describe, expect, it } from "vitest";
import { isCeoCandidate, shouldApplyCeoRoutingPolicy } from "../services/ceo-routing-policy.js";

describe("CEO routing policy", () => {
  it("applies to legacy JARVE prefix and newly-created JARVE names", () => {
    expect(shouldApplyCeoRoutingPolicy({ issuePrefix: "JARA", name: "Legacy" })).toBe(true);
    expect(shouldApplyCeoRoutingPolicy({ issuePrefix: "JAR", name: "JARVE" })).toBe(true);
    expect(shouldApplyCeoRoutingPolicy({ issuePrefix: "JAR", name: " jarve " })).toBe(true);
    expect(shouldApplyCeoRoutingPolicy({ issuePrefix: "JAR", name: "Jar Ventures" })).toBe(false);
    expect(shouldApplyCeoRoutingPolicy({ issuePrefix: "OPS", name: "Ops" })).toBe(false);
    expect(shouldApplyCeoRoutingPolicy(null)).toBe(false);
  });

  it("recognizes active CEO candidates by role or name", () => {
    expect(isCeoCandidate({ name: "Alex", role: "ceo", status: "idle" })).toBe(true);
    expect(isCeoCandidate({ name: "CEO", role: "general", status: "paused" })).toBe(true);
  });

  it("does not route to inactive CEO candidates", () => {
    expect(isCeoCandidate({ name: "CEO", role: "ceo", status: "pending_approval" })).toBe(false);
    expect(isCeoCandidate({ name: "CEO", role: "ceo", status: "terminated" })).toBe(false);
  });
});
