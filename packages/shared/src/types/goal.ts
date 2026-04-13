import type { GoalLevel, GoalStatus } from "../constants.js";

export interface GoalProgressBreakdown {
  doneCount: number;
  totalCount: number;
  percent: number | null;
  source: "issues";
}

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
  // Server-computed rollup of linked work. Optional because legacy tests and
  // some code paths build Goal objects without it; consumers must treat it as
  // possibly absent.
  progress?: GoalProgressBreakdown | null;
}
