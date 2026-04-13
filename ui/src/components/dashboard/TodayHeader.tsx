import { useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardCheck, DollarSign, Target } from "lucide-react";
import type { Goal } from "@paperclipai/shared";
import { goalsApi } from "../../api/goals";
import { queryKeys } from "../../lib/queryKeys";
import { cn, formatCents } from "../../lib/utils";
import { GoalProgress } from "../GoalProgress";

interface TodayHeaderProps {
  companyId: string;
  summary: {
    pendingApprovals: number;
    budgets: {
      pendingApprovals: number;
    };
    costs: {
      monthSpendCents: number;
      monthBudgetCents: number;
      monthUtilizationPercent: number;
    };
  };
}

function pickActiveGoal(goals: Goal[] | undefined): Goal | null {
  if (!goals || goals.length === 0) return null;
  // 1. Earliest active root company goal — matches getDefaultCompanyGoal on the server
  const roots = goals.filter((g) => g.parentId === null);
  const activeCompanyRoots = roots.filter((g) => g.level === "company" && g.status === "active");
  if (activeCompanyRoots.length > 0) {
    return [...activeCompanyRoots].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )[0];
  }
  // 2. Any root company goal
  const companyRoots = roots.filter((g) => g.level === "company");
  if (companyRoots.length > 0) {
    return [...companyRoots].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )[0];
  }
  // 3. First active goal of any kind
  const firstActive = goals.find((g) => g.status === "active");
  if (firstActive) return firstActive;
  // 4. Whatever exists
  return goals[0];
}

function HeaderCard({
  to,
  icon: Icon,
  label,
  children,
}: {
  to: string;
  icon: typeof Target;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex flex-col gap-2 rounded-md border border-border bg-card p-3 text-inherit no-underline transition-colors",
        "hover:border-foreground/20 hover:bg-accent/30",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
        <ArrowRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      {children}
    </Link>
  );
}

function ActiveGoalCard({ companyId }: { companyId: string }) {
  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(companyId),
    queryFn: () => goalsApi.list(companyId),
  });
  const active = useMemo(() => pickActiveGoal(goals), [goals]);

  if (!active) {
    return (
      <HeaderCard to="/goals" icon={Target} label="Goal">
        <span className="text-sm text-muted-foreground">No goals yet — set one to track progress.</span>
      </HeaderCard>
    );
  }

  return (
    <HeaderCard to={`/goals/${active.id}`} icon={Target} label="Goal">
      <span className="text-sm font-semibold text-foreground line-clamp-1">{active.title}</span>
      <GoalProgress goal={active} variant="hero" className="border-0 bg-transparent p-0" />
    </HeaderCard>
  );
}

function DecisionsCard({
  pendingApprovals,
  budgetApprovals,
}: {
  pendingApprovals: number;
  budgetApprovals: number;
}) {
  const total = pendingApprovals + budgetApprovals;
  return (
    <HeaderCard to="/approvals/pending" icon={ClipboardCheck} label="Decisions">
      <div className="flex items-baseline gap-2">
        <span className={cn(
          "text-2xl font-bold tabular-nums",
          total > 0 ? "text-foreground" : "text-muted-foreground",
        )}>
          {total}
        </span>
        <span className="text-sm text-muted-foreground">
          {total === 0
            ? "Nothing waiting on you"
            : total === 1
              ? "decision waiting on you"
              : "decisions waiting on you"}
        </span>
      </div>
      {budgetApprovals > 0 && (
        <span className="text-xs text-amber-600 dark:text-amber-400">
          {budgetApprovals} budget override{budgetApprovals === 1 ? "" : "s"}
        </span>
      )}
    </HeaderCard>
  );
}

function SpendCard({
  monthSpendCents,
  monthBudgetCents,
  monthUtilizationPercent,
}: TodayHeaderProps["summary"]["costs"]) {
  const hasBudget = monthBudgetCents > 0;
  const percent = hasBudget ? Math.min(100, monthUtilizationPercent) : 0;
  const tone = !hasBudget
    ? "muted"
    : percent >= 100
      ? "danger"
      : percent >= 80
        ? "warning"
        : "ok";

  return (
    <HeaderCard to="/costs" icon={DollarSign} label="Spend this month">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-foreground">
          {formatCents(monthSpendCents)}
        </span>
        {hasBudget ? (
          <span className="text-sm text-muted-foreground">
            of {formatCents(monthBudgetCents)} cap
          </span>
        ) : (
          <span className="text-sm text-amber-600 dark:text-amber-400">No cap set</span>
        )}
      </div>
      {hasBudget && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full transition-[width] duration-300",
                tone === "danger" && "bg-red-500",
                tone === "warning" && "bg-amber-500",
                tone === "ok" && "bg-emerald-500",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className={cn(
            "text-[11px] tabular-nums",
            tone === "danger" && "text-red-600 dark:text-red-400 font-medium",
            tone === "warning" && "text-amber-600 dark:text-amber-400",
            tone === "ok" && "text-muted-foreground",
            tone === "muted" && "text-muted-foreground",
          )}>
            {Math.round(monthUtilizationPercent)}% used
          </span>
        </div>
      )}
    </HeaderCard>
  );
}

export function TodayHeader({ companyId, summary }: TodayHeaderProps) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <ActiveGoalCard companyId={companyId} />
      <DecisionsCard
        pendingApprovals={summary.pendingApprovals}
        budgetApprovals={summary.budgets.pendingApprovals}
      />
      <SpendCard {...summary.costs} />
    </div>
  );
}
