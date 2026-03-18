import { useMemo } from "react";
import {
  LayoutDashboard,
  Shield,
  FileText,
  Users,
  Trophy,
  BookOpen,
  BarChart3,
  Layers,
  Settings,
  LogOut,
  Building2,
  Zap,
  Target,
  UserCheck,
  FilePenLine,
  DollarSign,
  FileSignature,
  Plug,
  Link2,
  CreditCard,
  Archive,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import CFLogo from "@/components/CFLogo";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useTenant } from "@/hooks/useTenant";
import { useCarriers } from "@/hooks/useCarriers";
import { useAgentContracts } from "@/hooks/useAgentContracts";
import { useDrafts } from "@/hooks/useDrafts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  ownerOnly?: boolean;
  badge?: number;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

import type { DomainTenant } from "@/hooks/useTenantFromDomain";

export function AppSidebar({ domainTenant }: { domainTenant?: DomainTenant | null } = {}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { data: currentAgent } = useCurrentAgent();
  const { data: tenant } = useTenant();
  const { data: allCarriers } = useCarriers();
  const { data: myContracts } = useAgentContracts(currentAgent?.id);
  const { data: drafts } = useDrafts();
  const { isSuperAdmin } = useSuperAdmin();
  const isOwner = currentAgent?.is_owner ?? false;
  const draftCount = drafts?.length ?? 0;

  const carrierBadgeCount = useMemo(() => {
    if (!allCarriers || !myContracts) return 0;
    const activeCarriers = allCarriers.filter((c) => c.status === "active");
    const carriersWithWritingNumbers = new Set(
      myContracts
        .filter((c) => c.agent_number && c.agent_number.trim() !== "")
        .map((c) => c.carrier)
    );
    return activeCarriers.filter((c) => !carriersWithWritingNumbers.has(c.name)).length;
  }, [allCarriers, myContracts]);

  const navSections: NavSection[] = [
    {
      label: "Overview",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "My Production", url: "/my-production", icon: FileText },
      ],
    },
    {
      label: "Team",
      items: [
        { title: "Team Production", url: "/team-production", icon: BarChart3 },
        { title: "Book of Business", url: "/book-of-business", icon: BookOpen },
        { title: "Scoreboard", url: "/scoreboard", icon: Trophy },
        { title: "Active Agents", url: "/active-agents", icon: UserCheck },
        { title: "Agent Roster", url: "/agent-roster", icon: Users },
        { title: "Contracts", url: "/contracts", icon: FileSignature },
        { title: "Drafts", url: "/drafts", icon: FilePenLine, badge: draftCount > 0 ? draftCount : undefined },
      ],
    },
    {
      label: "Admin",
      items: [
        { title: "Commission Levels", url: "/commission-levels", icon: Layers },
        { title: "Positions", url: "/positions", icon: Target, ownerOnly: true },
        { title: "Carriers", url: "/carriers", icon: Building2, ownerOnly: true, badge: carrierBadgeCount > 0 ? carrierBadgeCount : undefined },
        { title: "Payroll", url: "/payroll", icon: DollarSign, ownerOnly: true },
        { title: "Integrations", url: "/integrations", icon: Plug, ownerOnly: true },
        { title: "Auth Links", url: "/authenticated-links", icon: Link2, ownerOnly: true },
        { title: "Billing", url: "/settings?tab=billing", icon: CreditCard, ownerOnly: true },
      ],
    },
    {
      label: "Settings",
      items: [
        { title: "Settings", url: "/settings", icon: Settings },
        { title: "Archived Agents", url: "/archived-agents", icon: Archive, ownerOnly: true },
      ],
    },
  ];

  const initials = currentAgent
    ? `${(currentAgent.first_name || "")[0] || ""}${(currentAgent.last_name || "")[0] || ""}`.toUpperCase()
    : "?";

  return (
    <Sidebar collapsible="icon" className="shadow-[4px_0_16px_-4px_rgb(0_0_0/0.12)]">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className="flex items-center gap-2.5">
          {(domainTenant?.logo_url || tenant?.logo_url) ? (
            <img
              src={domainTenant?.logo_url || tenant?.logo_url || ""}
              alt="Logo"
              className="h-8 w-8 rounded-lg object-contain shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
              }}
            />
          ) : (
            <CFLogo size="sm" />
          )}
          {!collapsed && (
            <span className="text-base font-bold tracking-tight text-sidebar-foreground">
              {domainTenant?.agency_name || tenant?.agency_name || "BaseshopHQ"}
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {isSuperAdmin && (
          <SidebarGroup className="py-1">
            {!collapsed && (
              <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-primary">
                Platform Admin
              </p>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/super-admin"}>
                    <NavLink
                      to="/super-admin"
                      end
                      className={cn(
                        "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                        location.pathname.startsWith("/super-admin")
                          ? "bg-primary/10 text-sidebar-accent-foreground border-l-2 border-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                      )}
                      activeClassName=""
                    >
                      <Shield className={cn("h-4 w-4 shrink-0 transition-all duration-200", location.pathname.startsWith("/super-admin") && "text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]")} />
                      {!collapsed && <span>All Accounts</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) => !item.ownerOnly || isOwner);
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={section.label} className="py-1">
              {!collapsed && (
                <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted">
                  {section.label}
                </p>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => {
                    const isActive = location.pathname === item.url;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isActive}>
                          <NavLink
                            to={item.url}
                            end
                            className={cn(
                              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                              isActive
                                ? "bg-primary/10 text-sidebar-accent-foreground border-l-2 border-primary"
                                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                            )}
                            activeClassName=""
                          >
                            <item.icon className={cn(
                              "h-4 w-4 shrink-0 transition-all duration-200",
                              isActive && "text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]"
                            )} />
                            {!collapsed && <span>{item.title}</span>}
                            {!collapsed && item.badge != null && item.badge > 0 && (
                              <span className="ml-auto inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground min-w-[18px]">
                                {item.badge}
                              </span>
                            )}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3 space-y-3">
        {!collapsed && (
          <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-xs font-bold text-primary-foreground ring-2 ring-primary/30 ring-offset-1 ring-offset-sidebar-background">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {currentAgent ? `${currentAgent.first_name} ${currentAgent.last_name}` : ""}
              </p>
              <p className="text-[11px] text-sidebar-muted truncate">{user?.email}</p>
            </div>
          </div>
        )}

        {!collapsed && (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-3 py-2 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
          >
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span>Pro Mode</span>
            <span className="ml-auto text-[10px] text-sidebar-muted">Soon</span>
          </button>
        )}

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-8 w-8 text-sidebar-muted hover:text-sidebar-foreground"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
