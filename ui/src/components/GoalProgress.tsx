import type { Goal } from "@paperclipai/shared";
import { Calendar, Target } from "lucide-react";
import { cn } from "../lib/utils";

interface GoalProgressProps {
  goal: Pick<Goal, "currentValue" | "targetValue" | "unit" | "metric" | "dueAt">;
  variant?: "hero" | "inline";
  className?: string;
}

function parseNumeric(value: string | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatValue(n: number, unit: string | null): string {
  const formatted = Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (!unit) return formatted;
  // Currency-style units render as prefix; everything else as suffix.
  if (/^[$€£¥]$/.test(unit) || /^[A-Z]{3}$/.test(unit)) return `${unit} ${formatted}`;
  return `${formatted} ${unit}`;
}

function formatDueAt(dueAt: Date | string | null): { label: string; tone: "neutral" | "soon" | "overdue" } | null {
  if (!dueAt) return null;
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  if (isNaN(due.getTime())) return null;
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const dateLabel = due.toLocaleDateString(undefined, { month: "short", day: "numeric", year: due.getFullYear() === now.getFullYear() ? undefined : "numeric" });
  if (days < 0) return { label: `${dateLabel} (${Math.abs(days)}d overdue)`, tone: "overdue" };
  if (days === 0) return { label: `Due today`, tone: "soon" };
  if (days <= 7) return { label: `${dateLabel} (in ${days}d)`, tone: "soon" };
  return { label: dateLabel, tone: "neutral" };
}

export function GoalProgress({ goal, variant = "hero", className }: GoalProgressProps) {
  const current = parseNumeric(goal.currentValue);
  const target = parseNumeric(goal.targetValue);
  const hasTarget = target !== null && target > 0;
  const percent = hasTarget && current !== null ? Math.max(0, Math.min(100, (current / target!) * 100)) : null;
  const due = formatDueAt(goal.dueAt);

  if (!hasTarget && !goal.metric && !due) return null;

  if (variant === "inline") {
    if (!hasTarget) return null;
    return (
      <span className={cn("flex items-center gap-1.5 shrink-0", className)}>
        <span className="h-1 w-16 rounded-full bg-muted overflow-hidden">
          <span
            className="block h-full bg-emerald-500"
            style={{ width: `${percent ?? 0}%` }}
          />
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{Math.round(percent ?? 0)}%</span>
      </span>
    );
  }

  return (
    <div className={cn("rounded-md border border-border bg-card p-3 space-y-2", className)}>
      <div className="flex items-baseline gap-2">
        {goal.metric ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            {goal.metric}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            Progress
          </span>
        )}
        {hasTarget && (
          <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">
            {current !== null ? formatValue(current, goal.unit) : "—"}
            <span className="text-muted-foreground font-normal"> / {formatValue(target!, goal.unit)}</span>
          </span>
        )}
      </div>
      {hasTarget && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${percent ?? 0}%` }}
          />
        </div>
      )}
      {(due || hasTarget) && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {hasTarget ? `${Math.round(percent ?? 0)}% complete` : ""}
          </span>
          {due && (
            <span
              className={cn(
                "flex items-center gap-1",
                due.tone === "overdue" && "text-red-600 dark:text-red-400 font-medium",
                due.tone === "soon" && "text-amber-600 dark:text-amber-400",
              )}
            >
              <Calendar className="h-3 w-3" />
              {due.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
