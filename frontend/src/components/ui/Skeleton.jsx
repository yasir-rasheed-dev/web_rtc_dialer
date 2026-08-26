export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />;
}

export function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div className="space-y-2 p-1">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-3">
          {Array.from({ length: cols }).map((__, col) => (
            <Skeleton key={col} className={`h-4 flex-1 ${col === 0 ? "max-w-[140px]" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-border bg-surface p-5">
          <Skeleton className="mb-3 h-4 w-24" />
          <Skeleton className="mb-2 h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
