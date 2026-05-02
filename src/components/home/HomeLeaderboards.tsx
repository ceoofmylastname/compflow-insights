import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useHomeLeaderboards, type LeaderboardTab } from "@/hooks/useHomePage";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { Trophy, Users, TrendingUp } from "lucide-react";

/**
 * Three-tab leaderboards section per the Antigravity Prompt 4 spec.
 * Top Producers ranks Booked + Realized premium per the canonical
 * seven-status model. Inherits the Scoreboard view-down carve-out
 * (agency-wide aggregate visible to every member).
 */
export function HomeLeaderboards() {
  const [tab, setTab] = useState<LeaderboardTab>("producers");

  return (
    <div className="card-elevated p-5 animate-slide-up">
      <div className="flex items-center gap-2 mb-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Trophy className="h-4 w-4 text-primary" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Leaderboards</h3>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as LeaderboardTab)}>
        <TabsList className="grid grid-cols-3 w-full h-9">
          <TabsTrigger value="producers" className="text-xs">
            <Trophy className="h-3 w-3 mr-1" /> Top Producers
          </TabsTrigger>
          <TabsTrigger value="recruiters" className="text-xs">
            <Users className="h-3 w-3 mr-1" /> Top Recruiters
          </TabsTrigger>
          <TabsTrigger value="improved" className="text-xs">
            <TrendingUp className="h-3 w-3 mr-1" /> Most Improved
          </TabsTrigger>
        </TabsList>
        <TabsContent value="producers" className="mt-3">
          <LeaderboardList tab="producers" unit="currency" />
        </TabsContent>
        <TabsContent value="recruiters" className="mt-3">
          <LeaderboardList tab="recruiters" unit="count" />
        </TabsContent>
        <TabsContent value="improved" className="mt-3">
          <LeaderboardList tab="improved" unit="currency" deltaMode />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LeaderboardList({
  tab,
  unit,
  deltaMode = false,
}: {
  tab: LeaderboardTab;
  unit: "currency" | "count";
  deltaMode?: boolean;
}) {
  const { data: rows, isLoading } = useHomeLeaderboards(tab);
  const fmt = unit === "currency" ? formatCurrency : formatNumber;

  if (isLoading) {
    return <p className="text-xs text-muted-foreground py-4 text-center">Loading...</p>;
  }
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No data yet for this period.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const initials = r.name
          .split(" ")
          .map((p) => p[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase();
        const isPositiveDelta = !deltaMode || r.amount >= 0;
        return (
          <div key={r.agentId} className="flex items-center gap-3">
            <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
              {initials || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
              {r.position && (
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.position}</p>
              )}
            </div>
            <span
              className={`text-sm font-semibold tabular-nums ${
                deltaMode
                  ? isPositiveDelta
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                  : "text-foreground"
              }`}
            >
              {deltaMode && isPositiveDelta && r.amount > 0 ? "+" : ""}
              {fmt(r.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
