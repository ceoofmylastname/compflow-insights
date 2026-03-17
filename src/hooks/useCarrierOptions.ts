import { useMemo } from "react";
import { useCarriers } from "@/hooks/useCarriers";

export function useCarrierOptions() {
  const { data: carriers, isLoading } = useCarriers();

  const carrierNames = useMemo(
    () =>
      (carriers ?? [])
        .filter((c) => c.status === "active")
        .map((c) => c.name)
        .sort(),
    [carriers]
  );

  const products = useMemo(
    () =>
      (carrierName: string): string[] => {
        const carrier = (carriers ?? []).find((c) => c.name === carrierName);
        return (carrier?.carrier_products ?? []).map((p) => p.name).sort();
      },
    [carriers]
  );

  return { carriers: carrierNames, products, isLoading };
}
