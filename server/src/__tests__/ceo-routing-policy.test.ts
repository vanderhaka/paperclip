import { describe, expect, it } from "vitest";
import { isCeoCandidate, shouldApplyCeoRoutingPolicy } from "../services/ceo-routing-policy.js";

describe("CEO routing policy", () => {
  it("applies only to the JARVE company prefix", () => {
    expect(shouldApplyCeoRoutingPolicy({ issuePrefix: "JARA" })).toBe(true);
    expect(shouldApplyCeoRoutingPolicy({ issuePrefix: "OPS" })).toBe(false);
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
