export type NormalizedAgentPermissions = Record<string, unknown> & {
  canCreateAgents: boolean;
  canAutoApproveOwnHireRequests: boolean;
};

export function defaultPermissionsForRole(role: string): NormalizedAgentPermissions {
  const isCeo = role === "ceo";
  return {
    canCreateAgents: isCeo,
    canAutoApproveOwnHireRequests: isCeo,
  };
}

export function normalizeAgentPermissions(
  permissions: unknown,
  role: string,
): NormalizedAgentPermissions {
  const defaults = defaultPermissionsForRole(role);
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
    return defaults;
  }

  const record = permissions as Record<string, unknown>;
  return {
    canCreateAgents:
      typeof record.canCreateAgents === "boolean"
        ? record.canCreateAgents
        : defaults.canCreateAgents,
    canAutoApproveOwnHireRequests:
      typeof record.canAutoApproveOwnHireRequests === "boolean"
        ? record.canAutoApproveOwnHireRequests
        : defaults.canAutoApproveOwnHireRequests,
  };
}
