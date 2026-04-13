import { z } from "zod";
import { GOAL_LEVELS, GOAL_STATUSES } from "../constants.js";

// Numeric values are stored as Postgres numeric (string in JS). Accept either
// a numeric string or a number from the client; coerce the empty string to null.
const numericString = z
  .union([z.string(), z.number()])
  .transform((v) => {
    if (v === "" || v === null || v === undefined) return null;
    return typeof v === "number" ? String(v) : v;
  })
  .nullable()
  .optional();

const dueAtField = z
  .union([z.string().datetime(), z.string().length(0), z.date()])
  .transform((v) => {
    if (v === "" || v === null || v === undefined) return null;
    return v instanceof Date ? v.toISOString() : v;
  })
  .nullable()
  .optional();

export const createGoalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  level: z.enum(GOAL_LEVELS).optional().default("task"),
  status: z.enum(GOAL_STATUSES).optional().default("planned"),
  parentId: z.string().uuid().optional().nullable(),
  ownerAgentId: z.string().uuid().optional().nullable(),
  metric: z.string().optional().nullable(),
  targetValue: numericString,
  currentValue: numericString,
  unit: z.string().optional().nullable(),
  dueAt: dueAtField,
});

export type CreateGoal = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = createGoalSchema.partial();

export type UpdateGoal = z.infer<typeof updateGoalSchema>;
