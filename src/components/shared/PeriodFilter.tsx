import { useState, useCallback } from "react";
import { startOfToday, startOfWeek, startOfMonth, subMonths, format } from "date-fns";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PeriodDates {
  from: string;
  to: string;
}

const PERIODS: { label: string; getDates: () => PeriodDates }[] = [
  {
    label: "Today",
    getDates: () => ({
      from: format(startOfToday(), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    }),
  },
  {
    label: "This Week",
    getDates: () => ({
      from: format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    }),
  },
  {
    label: "This Month",
    getDates: () => ({
      from: format(startOfMonth(new Date()), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    }),
  },
  {
    label: "3M",
    getDates: () => ({
      from: format(subMonths(new Date(), 3), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    }),
  },
  {
    label: "6M",
    getDates: () => ({
      from: format(subMonths(new Date(), 6), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    }),
  },
  {
    label: "12M",
    getDates: () => ({
      from: format(subMonths(new Date(), 12), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    }),
  },
  {
    label: "All",
    getDates: () => ({ from: "", to: "" }),
  },
];

interface PeriodFilterProps {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (from: string) => void;
  onDateToChange: (to: string) => void;
}

export function PeriodFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: PeriodFilterProps) {
  const [activePeriod, setActivePeriod] = useState<string | null>(null);

  const handlePeriodClick = useCallback(
    (label: string, getDates: () => PeriodDates) => {
      const { from, to } = getDates();
      setActivePeriod(label);
      onDateFromChange(from);
      onDateToChange(to);
    },
    [onDateFromChange, onDateToChange]
  );

  const handleManualDateChange = useCallback(
    (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setActivePeriod(null);
      setter(e.target.value);
    },
    []
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-secondary p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => handlePeriodClick(p.label, p.getDates)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
              activePeriod === p.label
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Input
        type="date"
        value={dateFrom}
        onChange={handleManualDateChange(onDateFromChange)}
        className="w-36 h-8 text-xs bg-secondary border-0"
      />
      <Input
        type="date"
        value={dateTo}
        onChange={handleManualDateChange(onDateToChange)}
        className="w-36 h-8 text-xs bg-secondary border-0"
      />
    </div>
  );
}
