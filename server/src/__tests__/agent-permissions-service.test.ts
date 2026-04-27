import { describe, expect, it } from "vitest";
import {
  defaultPermissionsForRole,
  normalizeAgentPermissions,
} from "../services/agent-permissions.js";

describe("agent permission defaults", () => {
  it("lets CEOs create and auto-approve their own hires by default", () => {
    expect(defaultPermissionsForRole("ceo")).toMatchObject({
      canCreateAgents: true,
      canAutoApproveOwnHireRequests: true,
    });
  });

  it("keeps non-CEO agents review-gated by default", () => {
    expect(defaultPermissionsForRole("engineer")).toMatchObject({
      canCreateAgents: false,
      canAutoApproveOwnHireRequests: false,
    });
  });

  it("preserves an explicit auto-approval setting", () => {
    expect(
      normalizeAgentPermissions(
        {
          canCreateAgents: true,
          canAutoApproveOwnHireRequests: false,
        },
        "ceo",
      ),
    ).toMatchObject({
      canCreateAgents: true,
      canAutoApproveOwnHireRequests: false,
    });
  });
});
