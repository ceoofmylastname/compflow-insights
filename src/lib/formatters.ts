export const formatCurrency = (value: number | null | undefined): string => {
  if (value == null) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatPercent = (value: number | null | undefined): string => {
  if (value == null) return "--";
  return `${(value * 100).toFixed(2)}%`;
};

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const formatNumber = (value: number | null | undefined): string => {
  if (value == null) return "0";
  return new Intl.NumberFormat("en-US").format(value);
};
