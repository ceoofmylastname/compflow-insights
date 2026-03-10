import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonTableProps {
  columns?: number;
  rows?: number;
}

export function SkeletonTable({ columns = 6, rows = 5 }: SkeletonTableProps) {
  return (
    <div className="w-full space-y-3">
      <div className="flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={`${r}-${c}`} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
