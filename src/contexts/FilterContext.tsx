import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface FilterState {
  dateFrom: string;
  dateTo: string;
  period: string;
}

interface FilterContextValue extends FilterState {
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  setPeriod: (v: string) => void;
  resetFilters: () => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [period, setPeriod] = useState("all");

  const resetFilters = useCallback(() => {
    setDateFrom("");
    setDateTo("");
    setPeriod("all");
  }, []);

  return (
    <FilterContext.Provider
      value={{ dateFrom, dateTo, period, setDateFrom, setDateTo, setPeriod, resetFilters }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within a FilterProvider");
  return ctx;
}
