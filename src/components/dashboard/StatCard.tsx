import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  subtitle?: string;
  loading?: boolean;
  variant?: "default" | "hero";
  change?: number;
  changeLabel?: string;
  animationDelay?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  subtitle,
  loading,
  variant = "default",
  change,
  changeLabel,
  animationDelay,
}: StatCardProps) {
  const isHero = variant === "hero";
  const isPositive = change != null && change >= 0;

  return (
    <div
      className={cn(
        "animate-slide-up p-5",
        isHero ? "card-hero" : "card-elevated"
      )}
      style={animationDelay ? { animationDelay } : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <p
            className={cn(
              "text-xs font-medium uppercase tracking-wider",
              isHero ? "text-primary-foreground/70" : "text-muted-foreground"
            )}
          >
            {label}
          </p>
          {loading ? (
            <div
              className={cn(
                "h-8 w-28 animate-pulse rounded",
                isHero ? "bg-primary-foreground/20" : "bg-muted"
              )}
            />
          ) : (
            <p className={isHero ? "stat-number-hero" : "stat-number"}>
              {value}
            </p>
          )}
          {change != null && !loading && (
            <span className={isHero ? "badge-positive" : isPositive ? "badge-positive" : "badge-negative"}>
              {isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {isPositive ? "+" : ""}
              {change.toFixed(1)}%
              {changeLabel && (
                <span className="font-normal opacity-70 ml-0.5">{changeLabel}</span>
              )}
            </span>
          )}
          {subtitle && (
            <p
              className={cn(
                "text-xs",
                isHero ? "text-primary-foreground/70" : "text-muted-foreground"
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
        <div
          className={cn(
            "rounded-xl p-2.5",
            isHero ? "bg-primary-foreground/15" : "bg-accent"
          )}
        >
          <Icon
            className={cn(
              "h-5 w-5",
              isHero ? "text-primary-foreground" : "text-primary"
            )}
          />
        </div>
      </div>
    </div>
  );
}
