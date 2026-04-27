import { describe, expect, it } from "vitest";
import {
  buildBoardApprovalPayloadFromComment,
  hasBoardApprovalIntent,
} from "../services/board-approval-intent.ts";

describe("board approval intent", () => {
  it("detects explicit board handoff language", () => {
    expect(hasBoardApprovalIntent("Awaiting the board's call on JARA-11.")).toBe(true);
    expect(hasBoardApprovalIntent("Requesting board approval before we continue.")).toBe(true);
    expect(hasBoardApprovalIntent("Handing this back to the board for review.")).toBe(true);
  });

  it("does not turn ordinary progress comments into approvals", () => {
    expect(hasBoardApprovalIntent("Posted a progress update for the board to read later.")).toBe(false);
    expect(hasBoardApprovalIntent("No board approval is required for this one.")).toBe(false);
    expect(hasBoardApprovalIntent("We can proceed without board review.")).toBe(false);
  });

  it("builds a board approval payload tied to the source issue", () => {
    const payload = buildBoardApprovalPayloadFromComment(
      { id: "issue-1", identifier: "JARA-11", title: "Delegation" },
      "Awaiting the board's call on JARA-11.",
    );

    expect(payload).toMatchObject({
      title: "Board call on JARA-11",
      recommendedAction: "Review JARA-11 and approve, reject, or request changes.",
      source: "agent_comment",
      issueId: "issue-1",
      issueIdentifier: "JARA-11",
      issueTitle: "Delegation",
    });
  });
});
