import { Database, Gauge, ReceiptText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const SURFACES = [
  {
    title: "AI usage log",
    description: "Per-request AI usage and billed runs.",
    icon: Database,
    points: ["tokens + billed dollars", "provider, vendor, model", "subscription and overage aware"],
    tone: "border-sky-500/20 bg-sky-500/[0.06]",
  },
  {
    title: "Billing log",
    description: "Account-level charges that aren't tied to a single AI request.",
    icon: ReceiptText,
    points: ["top-ups, refunds, fees", "Bedrock provisioned or training charges", "credit expiries and adjustments"],
    tone: "border-amber-500/25 bg-amber-500/[0.07]",
  },
  {
    title: "Live quotas",
    description: "Provider or vendor windows that can stop traffic in real time.",
    icon: Gauge,
    points: ["provider quota windows", "vendor credit systems", "errors surfaced directly"],
    tone: "border-emerald-500/25 bg-emerald-500/[0.07]",
  },
] as const;

export function AccountingModelCard() {
  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="px-5 pt-5 pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Accounting model
        </CardTitle>
        <CardDescription className="max-w-2xl text-sm leading-6">
          Paperclip separates per-request AI usage from account-level billing charges.
          That keeps provider reporting honest when the vendor is OpenRouter, Cloudflare, Bedrock, or another intermediary.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 pb-5 md:grid-cols-3">
        {SURFACES.map((surface) => {
          const Icon = surface.icon;
          return (
            <div
              key={surface.title}
              className={`rounded-lg border ${surface.tone} p-4 shadow-xs`}
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/80">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{surface.title}</div>
                  <div className="text-xs text-muted-foreground">{surface.description}</div>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {surface.points.map((point) => (
                  <div key={point}>{point}</div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
