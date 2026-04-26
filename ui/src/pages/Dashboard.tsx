import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  DollarSign,
  LayoutDashboard,
  ListTodo,
  PauseCircle,
  PlayCircle,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Agent, Issue } from "@paperclipai/shared";
import { dashboardApi } from "../api/dashboard";
import { activityApi } from "../api/activity";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { StatusIcon } from "../components/StatusIcon";
import { StatusBadge } from "../components/StatusBadge";
import { ActivityRow } from "../components/ActivityRow";
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn, formatCents } from "../lib/utils";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
import { ChartCard, IssueStatusChart, RunActivityChart, SuccessRateChart } from "../components/ActivityCharts";
import { PageSkeleton } from "../components/PageSkeleton";
import { TodayHeader } from "../components/dashboard/TodayHeader";
import { PluginSlotOutlet } from "@/plugins/slots";
import { Button } from "@/components/ui/button";

type Tone = "danger" | "warning" | "info" | "success" | "neutral";

const toneStyles: Record<Tone, { item: string; icon: string; dot: string; badge: string }> = {
  danger: {
    item: "border-red-500/25 bg-red-500/[0.06]",
    icon: "bg-red-500/10 text-red-600 dark:text-red-300",
    dot: "bg-red-500",
    badge: "bg-red-500 text-white",
  },
  warning: {
    item: "border-amber-500/30 bg-amber-500/[0.07]",
    icon: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    badge: "bg-amber-500 text-white",
  },
  info: {
    item: "border-cyan-500/25 bg-cyan-500/[0.06]",
    icon: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
    dot: "bg-cyan-500",
    badge: "bg-cyan-600 text-white",
  },
  success: {
    item: "border-emerald-500/25 bg-emerald-500/[0.06]",
    icon: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    badge: "bg-emerald-600 text-white",
  },
  neutral: {
    item: "border-border/70 bg-card/90",
    icon: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/45",
    badge: "bg-muted text-muted-foreground",
  },
};

function getRecentIssues(issues: Issue[]): Issue[] {
  return [...issues]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function HomePanel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border/70 bg-card/90 p-4 shadow-xs", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function AttentionItem({
  icon: Icon,
  label,
  detail,
  count,
  tone,
  to,
  action,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  count: number;
  tone: Tone;
  to: string;
  action: string;
}) {
  const styles = toneStyles[tone];
  return (
    <Link
      to={to}
      className={cn(
        "group flex items-center gap-3 rounded-lg border p-3 text-inherit no-underline transition-colors hover:border-primary/30 hover:bg-accent/45",
        styles.item,
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", styles.icon)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold">{label}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", styles.badge)}>
            {count}
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        {action}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

function EmptyAttentionItem() {
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border p-3", toneStyles.success.item)}>
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", toneStyles.success.icon)}>
        <CheckCircle2 className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold">Nothing urgent right now</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Approvals, budgets, blocked work, and agent errors are clear.</p>
      </div>
    </div>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail?: string;
  tone?: Tone;
}) {
  const styles = toneStyles[tone];
  return (
    <div className="rounded-lg border border-border/70 bg-background/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
          {detail && <p className="mt-1 text-[11px] text-muted-foreground/80">{detail}</p>}
        </div>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", styles.icon)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function AgentStatusTile({
  label,
  value,
  detail,
  tone,
  to,
}: {
  label: string;
  value: number;
  detail: string;
  tone: Tone;
  to: string;
}) {
  const styles = toneStyles[tone];
  return (
    <Link
      to={to}
      className="rounded-lg border border-border/70 bg-card/90 p-3 text-inherit no-underline shadow-xs transition-colors hover:border-primary/25 hover:bg-accent/45"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("h-2 w-2 rounded-full", styles.dot)} />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </Link>
  );
}

function WorkItem({ issue, agentName }: { issue: Issue; agentName: string | null }) {
  return (
    <Link
      to={`/issues/${issue.identifier ?? issue.id}`}
      className="block rounded-md border border-border/60 bg-background/45 px-3 py-2.5 text-inherit no-underline transition-colors hover:border-primary/25 hover:bg-accent/45"
    >
      <div className="flex items-start gap-2.5">
        <StatusIcon status={issue.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{issue.title}</span>
            <StatusBadge status={issue.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{issue.identifier ?? issue.id.slice(0, 8)}</span>
            {agentName && <Identity name={agentName} size="sm" />}
            <span>{timeAgo(issue.updatedAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function BudgetProgress({
  spendCents,
  budgetCents,
  utilization,
}: {
  spendCents: number;
  budgetCents: number;
  utilization: number;
}) {
  const hasBudget = budgetCents > 0;
  const pct = hasBudget ? Math.min(100, Math.max(0, utilization)) : 0;
  const tone = !hasBudget ? "warning" : pct >= 90 ? "danger" : pct >= 70 ? "warning" : "success";
  return (
    <div className="rounded-lg border border-border/70 bg-background/50 p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted-foreground">Budget</span>
        <span className="font-semibold tabular-nums">
          {hasBudget ? `${Math.round(utilization)}%` : "No cap"}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            tone === "danger" && "bg-red-500",
            tone === "warning" && "bg-amber-500",
            tone === "success" && "bg-emerald-500",
          )}
          style={{ width: `${hasBudget ? pct : 100}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {formatCents(spendCents)}
        {hasBudget ? ` of ${formatCents(budgetCents)} monthly cap` : " spent this month. Set a monthly cap."}
      </p>
    </div>
  );
}

export function Dashboard() {
  const { selectedCompanyId, selectedCompany, companies } = useCompany();
  const { openNewIssue, openOnboarding } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [animatedActivityIds, setAnimatedActivityIds] = useState<Set<string>>(new Set());
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hydratedActivityRef = useRef(false);
  const activityAnimationTimersRef = useRef<number[]>([]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Home" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!, undefined, 80),
    enabled: !!selectedCompanyId,
  });

  const recentIssues = issues ? getRecentIssues(issues) : [];
  const recentActivity = useMemo(() => (activity ?? []).slice(0, 8), [activity]);
  const activeIssues = recentIssues
    .filter((issue) => issue.status !== "done" && issue.status !== "cancelled")
    .slice(0, 5);

  useEffect(() => {
    for (const timer of activityAnimationTimersRef.current) {
      window.clearTimeout(timer);
    }
    activityAnimationTimersRef.current = [];
    seenActivityIdsRef.current = new Set();
    hydratedActivityRef.current = false;
    setAnimatedActivityIds(new Set());
  }, [selectedCompanyId]);

  useEffect(() => {
    if (recentActivity.length === 0) return;

    const seen = seenActivityIdsRef.current;
    const currentIds = recentActivity.map((event) => event.id);

    if (!hydratedActivityRef.current) {
      for (const id of currentIds) seen.add(id);
      hydratedActivityRef.current = true;
      return;
    }

    const newIds = currentIds.filter((id) => !seen.has(id));
    if (newIds.length === 0) {
      for (const id of currentIds) seen.add(id);
      return;
    }

    setAnimatedActivityIds((prev) => {
      const next = new Set(prev);
      for (const id of newIds) next.add(id);
      return next;
    });

    for (const id of newIds) seen.add(id);

    const timer = window.setTimeout(() => {
      setAnimatedActivityIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.delete(id);
        return next;
      });
      activityAnimationTimersRef.current = activityAnimationTimersRef.current.filter((t) => t !== timer);
    }, 980);
    activityAnimationTimersRef.current.push(timer);
  }, [recentActivity]);

  useEffect(() => {
    return () => {
      for (const timer of activityAnimationTimersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    return map;
  }, [issues, agents, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message="Welcome to Paperclip. Set up your first company and agent to get started."
          action="Get Started"
          onAction={openOnboarding}
        />
      );
    }
    return (
      <EmptyState icon={LayoutDashboard} message="Create or select a company to view the dashboard." />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-4 text-sm text-red-700 dark:text-red-200">
        {error instanceof Error ? error.message : "Failed to load the dashboard."}
      </div>
    );
  }

  const approvalTotal = data.pendingApprovals + data.budgets.pendingApprovals;
  const attentionItems = [
    {
      icon: ClipboardCheck,
      label: "Pending approvals",
      detail: data.budgets.pendingApprovals > 0
        ? `${data.budgets.pendingApprovals} budget override${data.budgets.pendingApprovals === 1 ? "" : "s"} included`
        : "Board review is waiting",
      count: approvalTotal,
      tone: approvalTotal > 0 ? "warning" as const : "neutral" as const,
      to: "/approvals/pending",
      action: "Review",
    },
    {
      icon: PauseCircle,
      label: "Budget stopped",
      detail: `${data.budgets.pausedAgents} agents and ${data.budgets.pausedProjects} projects paused`,
      count: data.budgets.activeIncidents,
      tone: data.budgets.activeIncidents > 0 ? "danger" as const : "neutral" as const,
      to: "/costs",
      action: "Open spend",
    },
    {
      icon: AlertTriangle,
      label: "Blocked tasks",
      detail: "Work that needs an operator decision or new input",
      count: data.tasks.blocked,
      tone: data.tasks.blocked > 0 ? "danger" as const : "neutral" as const,
      to: "/issues",
      action: "Open tasks",
    },
    {
      icon: Bot,
      label: "Agent errors",
      detail: "Agents currently reporting an error state",
      count: data.agents.error,
      tone: data.agents.error > 0 ? "danger" as const : "neutral" as const,
      to: "/agents/error",
      action: "Inspect",
    },
  ];
  const urgentItems = attentionItems.filter((item) => item.count > 0);
  const hasNoAgents = agents !== undefined && agents.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
      {error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {error instanceof Error ? error.message : "Some dashboard data could not be refreshed."}
        </div>
      )}

      {hasNoAgents && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <p className="text-sm text-amber-900 dark:text-amber-100">You have no agents yet.</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => openOnboarding({ initialStep: 2, companyId: selectedCompanyId })}
          >
            <Plus className="h-4 w-4" />
            Add agent
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Home</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {selectedCompany?.name ?? "Company"} control room
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The shortest path to what needs attention, what is running, and what to do next.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => openNewIssue()}>
            <Plus className="h-4 w-4" />
            New task
          </Button>
          <Button variant="outline" asChild>
            <Link to="/approvals/pending">
              <ShieldCheck className="h-4 w-4" />
              Approvals
            </Link>
          </Button>
        </div>
      </div>

      <TodayHeader companyId={selectedCompanyId} summary={data} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <HomePanel
              title="Needs attention"
              description="Only the things that can block the company."
              action={
                urgentItems.length > 0 ? (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {urgentItems.length} active
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Clear
                  </span>
                )
              }
            >
              <div className="space-y-2.5">
                {urgentItems.length > 0
                  ? urgentItems.map((item) => <AttentionItem key={item.label} {...item} />)
                  : <EmptyAttentionItem />}
              </div>
            </HomePanel>

            <HomePanel
              title="Active work"
              description="The current workload at a glance."
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/issues">
                    Open tasks
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              }
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <QuickStat
                  icon={PlayCircle}
                  label="In progress"
                  value={data.tasks.inProgress}
                  detail={`${data.tasks.open} open total`}
                  tone={data.tasks.inProgress > 0 ? "info" : "neutral"}
                />
                <QuickStat
                  icon={Bot}
                  label="Running agents"
                  value={data.agents.running}
                  detail={`${data.agents.active} available`}
                  tone={data.agents.running > 0 ? "info" : "neutral"}
                />
                <QuickStat
                  icon={DollarSign}
                  label="Month spend"
                  value={formatCents(data.costs.monthSpendCents)}
                  detail={data.costs.monthBudgetCents > 0 ? "Against cap" : "No cap set"}
                  tone={data.costs.monthBudgetCents > 0 && data.costs.monthUtilizationPercent >= 90 ? "danger" : "neutral"}
                />
              </div>

              <div className="mt-3">
                <BudgetProgress
                  spendCents={data.costs.monthSpendCents}
                  budgetCents={data.costs.monthBudgetCents}
                  utilization={data.costs.monthUtilizationPercent}
                />
              </div>
            </HomePanel>
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Agents</h2>
                <p className="mt-1 text-xs text-muted-foreground">Who is able to work, paused, or needs recovery.</p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/agents/all">
                  Manage
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <AgentStatusTile label="Running" value={data.agents.running} detail="Executing now" tone="info" to="/agents/active" />
              <AgentStatusTile label="Ready" value={data.agents.active} detail="Available or idle" tone="success" to="/agents/active" />
              <AgentStatusTile label="Paused" value={data.agents.paused} detail="Stopped by board or guardrail" tone="warning" to="/agents/paused" />
              <AgentStatusTile label="Error" value={data.agents.error} detail="Needs inspection" tone="danger" to="/agents/error" />
            </div>
          </section>

          <HomePanel
            title="Recent tasks"
            description="Newest active work objects, with status and owner."
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/issues">
                  View all
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            }
          >
            {activeIssues.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 bg-background/45 p-4 text-sm text-muted-foreground">
                No active tasks yet.
              </div>
            ) : (
              <div className="space-y-2">
                {activeIssues.map((issue) => (
                  <WorkItem
                    key={issue.id}
                    issue={issue}
                    agentName={issue.assigneeAgentId ? agentName(issue.assigneeAgentId) : null}
                  />
                ))}
              </div>
            )}
          </HomePanel>

          <ActiveAgentsPanel companyId={selectedCompanyId} />

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Run activity" subtitle="Last 14 days">
              <RunActivityChart runs={runs ?? []} />
            </ChartCard>
            <ChartCard title="Issue status" subtitle="Current creation mix">
              <IssueStatusChart issues={issues ?? []} />
            </ChartCard>
            <ChartCard title="Success rate" subtitle="Last 14 days">
              <SuccessRateChart runs={runs ?? []} />
            </ChartCard>
          </div>

          <PluginSlotOutlet
            slotTypes={["dashboardWidget"]}
            context={{ companyId: selectedCompanyId }}
            className="grid gap-4 md:grid-cols-2"
            itemClassName="rounded-lg border border-border/70 bg-card/90 p-4 shadow-xs"
          />
        </div>

        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <HomePanel title="Quick actions" description="Common operator moves.">
            <div className="grid gap-2">
              <Button type="button" className="justify-start" onClick={() => openNewIssue()}>
                <ListTodo className="h-4 w-4" />
                Create task
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => openOnboarding({ initialStep: 2, companyId: selectedCompanyId })}
              >
                <Users className="h-4 w-4" />
                Add agent
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link to="/costs">
                  <DollarSign className="h-4 w-4" />
                  Open spend
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link to="/activity">
                  <CircleDot className="h-4 w-4" />
                  View activity
                </Link>
              </Button>
            </div>
          </HomePanel>

          <HomePanel
            title="Recent activity"
            description="Latest changes across the company."
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/activity">
                  All
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            }
          >
            {recentActivity.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 bg-background/45 p-4 text-sm text-muted-foreground">
                No activity yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/70 bg-background/35">
                {recentActivity.map((event, index) => (
                  <ActivityRow
                    key={event.id}
                    event={event}
                    agentMap={agentMap}
                    entityNameMap={entityNameMap}
                    entityTitleMap={entityTitleMap}
                    className={cn(
                      index > 0 && "border-t border-border/60",
                      animatedActivityIds.has(event.id) && "activity-row-enter",
                    )}
                  />
                ))}
              </div>
            )}
          </HomePanel>
        </aside>
      </div>
    </div>
  );
}
