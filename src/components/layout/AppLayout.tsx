import { ReactNode, useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAlerts } from "@/hooks/useAlerts";
import { useTenant } from "@/hooks/useTenant";
import { useTenantFromDomain, type DomainTenant } from "@/hooks/useTenantFromDomain";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import { hexToHsl } from "@/lib/formatters";
import { PeriodFilter } from "@/components/shared/PeriodFilter";
import { useFilters } from "@/contexts/FilterContext";

const SEEN_ALERTS_KEY = "compflow_seen_alerts";

function getSeenIds(): Set<string> {
  try {
    const stored = localStorage.getItem(SEEN_ALERTS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>) {
  localStorage.setItem(SEEN_ALERTS_KEY, JSON.stringify([...ids]));
}

function AlertBell() {
  const { data: alerts } = useAlerts();
  const [seenIds, setSeenIds] = useState<Set<string>>(getSeenIds);

  const unseenCount = (alerts ?? []).filter((a) => !seenIds.has(a.id)).length;

  const handleOpen = (open: boolean) => {
    if (open && alerts && alerts.length > 0) {
      const newSeen = new Set(seenIds);
      for (const a of alerts) newSeen.add(a.id);
      setSeenIds(newSeen);
      saveSeenIds(newSeen);
    }
  };

  if (!alerts || alerts.length === 0) return null;

  return (
    <Popover onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
          {unseenCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center px-1">
              {unseenCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Lapse Alerts</p>
          <p className="text-xs text-muted-foreground">
            {alerts.length} pending {alerts.length === 1 ? "policy" : "policies"} at chargeback risk
          </p>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y divide-border">
          {alerts.map((alert) => (
            <div key={alert.id} className="px-4 py-3 hover:bg-accent/50 transition-colors">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {alert.clientName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {alert.carrier} &middot; {alert.daysPending}d pending &middot;{" "}
                    {formatCurrency(alert.annualPremium)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BrandingInjector({ domainTenant }: { domainTenant?: DomainTenant | null }) {
  const { data: authTenant } = useTenant();
  const activeTenant = domainTenant || authTenant;

  useEffect(() => {
    if (activeTenant?.primary_color) {
      const hsl = hexToHsl(activeTenant.primary_color);
      document.documentElement.style.setProperty("--primary", hsl);
      document.documentElement.style.setProperty("--ring", hsl);
      document.documentElement.style.setProperty("--sidebar-primary", hsl);
      document.documentElement.style.setProperty("--sidebar-ring", hsl);
    }
    return () => {
      document.documentElement.style.removeProperty("--primary");
      document.documentElement.style.removeProperty("--ring");
      document.documentElement.style.removeProperty("--sidebar-primary");
      document.documentElement.style.removeProperty("--sidebar-ring");
    };
  }, [activeTenant?.primary_color]);

  useEffect(() => {
    if (activeTenant?.agency_name) {
      document.title = activeTenant.agency_name;
    } else {
      document.title = "BaseshopHQ";
    }
  }, [activeTenant?.agency_name]);

  return null;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { dateFrom, dateTo, setDateFrom, setDateTo } = useFilters();
  const { data: currentAgent } = useCurrentAgent();
  const { data: domainTenant } = useTenantFromDomain();

  const initials = currentAgent
    ? `${(currentAgent.first_name || "")[0] || ""}${(currentAgent.last_name || "")[0] || ""}`.toUpperCase()
    : "?";

  return (
    <SidebarProvider>
      <BrandingInjector domainTenant={domainTenant} />
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar domainTenant={domainTenant} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center border-b border-border bg-card px-4 md:px-6 gap-4 shrink-0">
            <SidebarTrigger className="mr-1" />

            <div className="hidden lg:flex items-center">
              <PeriodFilter
                dateFrom={dateFrom}
                dateTo={dateTo}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="relative hidden md:block">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  className="w-48 pl-9 h-9 bg-secondary border-0 text-sm focus-visible:ring-1"
                />
              </div>
              <AlertBell />
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-xs font-bold text-primary-foreground ring-2 ring-primary/30 ring-offset-1 ring-offset-card">
                {initials}
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto main-bg">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
