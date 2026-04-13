import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { dashboardApi } from "../api/dashboard";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatCents } from "../lib/utils";

interface Props {
  companyId: string;
  className?: string;
}

interface Forecast {
  daysElapsed: number;
  daysInMonth: number;
  dailyPaceCents: number;
  forecastMonthCents: number;
  capCents: number;
  hasCap: boolean;
  overCapBy: number | null; // positive when forecast exceeds cap
  capHitDate: Date | null;
  tone: "ok" | "warning" | "danger" | "muted";
}

function computeForecast(monthSpendCents: number, monthBudgetCents: number, now = new Date()): Forecast {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysElapsed = Math.max(1, now.getDate()); // avoid div/0 on day 1
  const dailyPaceCents = monthSpendCents / daysElapsed;
  const forecastMonthCents = Math.round(dailyPaceCents * daysInMonth);
  const hasCap = monthBudgetCents > 0;

  let tone: Forecast["tone"] = "muted";
  let overCapBy: number | null = null;
  let capHitDate: Date | null = null;

  if (hasCap) {
    if (forecastMonthCents >= monthBudgetCents) {
      overCapBy = forecastMonthCents - monthBudgetCents;
      // Day-of-month the cumulative spend crosses the cap
      if (dailyPaceCents > 0) {
        const dayHit = Math.min(daysInMonth, Math.ceil(monthBudgetCents / dailyPaceCents));
        capHitDate = new Date(year, month, dayHit);
      }
      tone = "danger";
    } else if (forecastMonthCents >= monthBudgetCents * 0.8) {
      tone = "warning";
    } else {
      tone = "ok";
    }
  }

  return {
    daysElapsed,
    daysInMonth,
    dailyPaceCents,
    forecastMonthCents,
    capCents: monthBudgetCents,
    hasCap,
    overCapBy,
    capHitDate,
    tone,
  };
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SpendHealthCard({ companyId, className }: Props) {
  const { data } = useQuery({
    queryKey: queryKeys.dashboard(companyId),
    queryFn: () => dashboardApi.summary(companyId),
    enabled: !!companyId,
  });
  const forecast = useMemo(
    () => (data ? computeForecast(data.costs.monthSpendCents, data.costs.monthBudgetCents) : null),
    [data],
  );

  if (!data || !forecast) return null;

  const { costs } = data;
  const percent = forecast.hasCap
    ? Math.min(100, Math.round((costs.monthSpendCents / forecast.capCents) * 100))
    : 0;
  const forecastPercent = forecast.hasCap
    ? Math.min(200, Math.round((forecast.forecastMonthCents / forecast.capCents) * 100))
    : 0;

  const headline = forecast.hasCap
    ? forecast.overCapBy !== null
      ? `Forecast exceeds your monthly cap by ${formatCents(forecast.overCapBy)}`
      : forecast.tone === "warning"
        ? `Forecast is close to your monthly cap`
        : `On pace to stay under your monthly cap`
    : `Forecast: ${formatCents(forecast.forecastMonthCents)} this month — no cap set`;

  const Icon = forecast.tone === "danger" ? AlertTriangle : TrendingUp;

  return (
    <div
      className={cn(
        "rounded-md border bg-card p-4 space-y-3",
        forecast.tone === "danger" && "border-red-500/30",
        forecast.tone === "warning" && "border-amber-500/30",
        forecast.tone === "ok" && "border-border",
        forecast.tone === "muted" && "border-border",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            forecast.tone === "danger" && "text-red-600 dark:text-red-400",
            forecast.tone === "warning" && "text-amber-600 dark:text-amber-400",
            forecast.tone === "ok" && "text-emerald-600 dark:text-emerald-400",
            forecast.tone === "muted" && "text-muted-foreground",
          )}
        />
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Budget health
        </span>
      </div>

      <p className={cn(
        "text-sm font-medium",
        forecast.tone === "danger" && "text-red-600 dark:text-red-400",
        forecast.tone === "warning" && "text-amber-700 dark:text-amber-400",
      )}>
        {headline}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">This month so far</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatCents(costs.monthSpendCents)}</div>
          {forecast.hasCap && (
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {percent}% of {formatCents(forecast.capCents)}
            </div>
          )}
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Forecast this month</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {formatCents(forecast.forecastMonthCents)}
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            at {formatCents(Math.round(forecast.dailyPaceCents))}/day · {forecast.daysElapsed}/{forecast.daysInMonth} days
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {forecast.capHitDate ? "Cap hits on" : forecast.hasCap ? "Headroom" : "Cap"}
          </div>
          <div className={cn(
            "mt-1 text-lg font-semibold tabular-nums",
            forecast.tone === "danger" && "text-red-600 dark:text-red-400",
          )}>
            {forecast.capHitDate
              ? formatShortDate(forecast.capHitDate)
              : forecast.hasCap
                ? formatCents(Math.max(0, forecast.capCents - forecast.forecastMonthCents))
                : "—"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {forecast.capHitDate
              ? "at current pace"
              : forecast.hasCap
                ? "left at forecast pace"
                : "set one on /costs"}
          </div>
        </div>
      </div>

      {forecast.hasCap && (
        <div className="space-y-1">
          <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
            {/* Cumulative spend */}
            <div
              className={cn(
                "absolute left-0 top-0 h-full",
                forecast.tone === "danger" && "bg-red-500",
                forecast.tone === "warning" && "bg-amber-500",
                forecast.tone === "ok" && "bg-emerald-500",
                forecast.tone === "muted" && "bg-muted-foreground/40",
              )}
              style={{ width: `${percent}%` }}
            />
            {/* Forecast tick — sits on top */}
            {forecastPercent > percent && forecastPercent <= 100 && (
              <div
                className="absolute top-[-2px] h-[calc(100%+4px)] w-0.5 bg-foreground/40"
                style={{ left: `${forecastPercent}%` }}
                title={`Forecast: ${formatCents(forecast.forecastMonthCents)}`}
              />
            )}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
            <span>$0</span>
            <span>{formatCents(forecast.capCents)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
