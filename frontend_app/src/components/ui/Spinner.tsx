import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/format";

export default function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <LoaderCircle
      className={cn("animate-spin", className ?? "size-4")}
      aria-label={label ?? "Loading"}
      role="status"
    />
  );
}

/** Placeholder bars shown while content loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} aria-hidden />;
}
