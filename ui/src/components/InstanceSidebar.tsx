import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock3, Cpu, FlaskConical, Puzzle, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { Link, NavLink } from "@/lib/router";
import { pluginsApi } from "@/api/plugins";
import { queryKeys } from "@/lib/queryKeys";
import { SIDEBAR_SCROLL_RESET_STATE } from "@/lib/navigation-scroll";
import { SidebarNavItem } from "./SidebarNavItem";

export function InstanceSidebar() {
  const { data: plugins } = useQuery({
    queryKey: queryKeys.plugins.all,
    queryFn: () => pluginsApi.list(),
  });

  return (
    <aside className="w-60 h-full min-h-0 border-r border-border bg-background flex flex-col">
      <div className="flex items-center gap-2 px-3 h-12 shrink-0">
        <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 ml-1" />
        <span className="flex-1 text-sm font-bold text-foreground truncate">
          Admin
        </span>
      </div>
      <div className="px-4 pb-2 -mt-1 text-[11px] text-muted-foreground leading-snug">
        Settings here affect every workspace on this Paperclip instance.
      </div>
      <Link
        to="/"
        state={SIDEBAR_SCROLL_RESET_STATE}
        className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
        Back to workspace
      </Link>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <SidebarNavItem to="/instance/settings/general" label="General" icon={SlidersHorizontal} end />
          <SidebarNavItem to="/instance/settings/heartbeats" label="Heartbeats" icon={Clock3} end />
          <SidebarNavItem to="/instance/settings/experimental" label="Experimental" icon={FlaskConical} />
          <SidebarNavItem to="/instance/settings/plugins" label="Plugins" icon={Puzzle} />
          <SidebarNavItem to="/instance/settings/adapters" label="Adapters" icon={Cpu} />
          {(plugins ?? []).length > 0 ? (
            <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-border/70 pl-3">
              {(plugins ?? []).map((plugin) => (
                <NavLink
                  key={plugin.id}
                  to={`/instance/settings/plugins/${plugin.id}`}
                  state={SIDEBAR_SCROLL_RESET_STATE}
                  className={({ isActive }) =>
                    [
                      "rounded-md px-2 py-1.5 text-xs transition-colors",
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    ].join(" ")
                  }
                >
                  {plugin.manifestJson.displayName ?? plugin.packageName}
                </NavLink>
              ))}
            </div>
          ) : null}
        </div>
      </nav>
    </aside>
  );
}
