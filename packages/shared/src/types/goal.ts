import type { GoalLevel, GoalStatus } from "../constants.js";

export interface Goal {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  level: GoalLevel;
  status: GoalStatus;
  parentId: string | null;
  ownerAgentId: string | null;
  metric: string | null;
  targetValue: string | null;
  currentValue: string | null;
  unit: string | null;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
