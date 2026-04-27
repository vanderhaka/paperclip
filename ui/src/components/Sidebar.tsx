import {
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  DollarSign,
  History,
  Search,
  SquarePen,
  Network,
  Boxes,
  Repeat,
  Settings,
  ClipboardCheck,
  MessageSquareText,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarAgents } from "./SidebarAgents";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { Button } from "@/components/ui/button";
import { PluginSlotOutlet } from "@/plugins/slots";

export function Sidebar() {
  const { openNewIssue } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const inboxBadge = useInboxBadge(selectedCompanyId);
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;

  function openSearch() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  return (
    <aside className="flex h-full min-h-0 w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Top bar: company name and search aligned with the global header. */}
      <div className="flex items-center gap-1 px-3 h-12 shrink-0">
        {selectedCompany?.brandColor && (
          <div
            className="w-4 h-4 rounded-sm shrink-0 ml-1"
            style={{ backgroundColor: selectedCompany.brandColor }}
          />
        )}
        <span className="flex-1 truncate pl-1 text-sm font-semibold text-sidebar-foreground">
          {selectedCompany?.name ?? "Select company"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          onClick={openSearch}
          aria-label="Search"
          title="Search"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <nav className="scrollbar-auto-hide flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => openNewIssue()}
            className="mb-1 flex items-center gap-2.5 rounded-md border border-sidebar-border bg-card/80 px-3 py-2 text-[13px] font-medium text-foreground shadow-xs transition-colors hover:bg-accent/60 hover:text-accent-foreground"
          >
            <SquarePen className="h-4 w-4 shrink-0" />
            <span className="truncate">New Task</span>
          </button>
          <SidebarNavItem to="/dashboard" label="Today" icon={LayoutDashboard} liveCount={liveRunCount} />
          <SidebarNavItem to="/command" label="Command" icon={MessageSquareText} />
          <SidebarNavItem
            to="/inbox"
            label="Inbox"
            icon={Inbox}
            badge={inboxBadge.inbox}
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
            ariaLabel={
              inboxBadge.inbox > 0
                ? `Inbox, ${inboxBadge.inbox} unread`
                : "Inbox, no unread messages"
            }
          />
          <SidebarNavItem to="/approvals/pending" label="Approvals" icon={ClipboardCheck} />
          <PluginSlotOutlet
            slotTypes={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-[13px] font-medium"
            missingBehavior="placeholder"
          />
        </div>

        <SidebarSection label="Goals">
          <SidebarNavItem to="/goals" label="Goals" icon={Target} />
          <SidebarNavItem to="/issues" label="Tasks" icon={CircleDot} />
          <SidebarNavItem to="/routines" label="Schedules" icon={Repeat} />
        </SidebarSection>

        <SidebarProjects />

        <SidebarAgents />

        <SidebarSection label="Workspace">
          <SidebarNavItem to="/org" label="Org" icon={Network} />
          <SidebarNavItem to="/skills" label="Skills" icon={Boxes} />
          <SidebarNavItem to="/costs" label="Spend" icon={DollarSign} />
          <SidebarNavItem to="/activity" label="Activity" icon={History} />
          <SidebarNavItem to="/company/settings" label="Settings" icon={Settings} />
        </SidebarSection>

        <PluginSlotOutlet
          slotTypes={["sidebarPanel"]}
          context={pluginContext}
          className="flex flex-col gap-3"
          itemClassName="rounded-lg border border-border p-3"
          missingBehavior="placeholder"
        />
      </nav>
    </aside>
  );
}
