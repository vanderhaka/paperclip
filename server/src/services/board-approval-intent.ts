const BOARD_APPROVAL_INTENT_PATTERNS = [
  /\bawaiting\s+(?:the\s+)?board(?:'s)?\s+(?:approval|call|decision|review)\b/i,
  /\b(?:requesting|requested|requires?|needs?|asking\s+for)\s+(?:the\s+)?board(?:'s)?\s+(?:approval|call|decision|review)\b/i,
  /\bhand(?:ing)?\s+(?:this|it|the\s+issue)?\s*(?:back\s+)?to\s+(?:the\s+)?board\s+for\s+(?:approval|call|decision|review)\b/i,
];

const NEGATED_BOARD_APPROVAL_PATTERNS = [
  /\b(?:no|not|without)\s+(?:board\s+)?(?:approval|call|decision|review)\b/i,
  /\bdoes\s+not\s+(?:need|require)\s+(?:the\s+)?board\b/i,
  /\bno\s+need\s+for\s+(?:the\s+)?board\b/i,
];

export type BoardApprovalIntentIssue = {
  id: string;
  identifier?: string | null;
  title: string;
};

export function hasBoardApprovalIntent(body: string): boolean {
  const normalized = body.trim();
  if (!normalized) return false;
  if (NEGATED_BOARD_APPROVAL_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  return BOARD_APPROVAL_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function buildBoardApprovalPayloadFromComment(
  issue: BoardApprovalIntentIssue,
  commentBody: string,
) {
  const issueRef = issue.identifier ?? issue.id;
  const summary = commentBody.trim();
  return {
    title: `Board call on ${issueRef}`,
    summary,
    recommendedAction: `Review ${issueRef} and approve, reject, or request changes.`,
    nextActionOnApproval: "The requester can proceed based on the board decision.",
    source: "agent_comment",
    issueId: issue.id,
    issueIdentifier: issue.identifier ?? null,
    issueTitle: issue.title,
  };
}
