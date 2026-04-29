import type { CompanyStatus, PauseReason } from "../constants.js";

export interface AgentHiringPolicy {
  defaultAdapterType: string;
  defaultAdapterConfig: Record<string, unknown>;
  defaultRuntimeConfig: Record<string, unknown>;
  disallowedAdapterTypes: string[];
  enforceAdapterDefaults: boolean;
}

export interface Company {
  id: string;
  name: string;
  description: string | null;
  status: CompanyStatus;
  pauseReason: PauseReason | null;
  pausedAt: Date | null;
  issuePrefix: string;
  issueCounter: number;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  requireBoardApprovalForNewAgents: boolean;
  agentHiringPolicy: AgentHiringPolicy | null;
  feedbackDataSharingEnabled: boolean;
  feedbackDataSharingConsentAt: Date | null;
  feedbackDataSharingConsentByUserId: string | null;
  feedbackDataSharingTermsVersion: string | null;
  brandColor: string | null;
  logoAssetId: string | null;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
