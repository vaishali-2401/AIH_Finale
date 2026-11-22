import type { ReactNode } from "react";
import { cn } from "@/lib/format";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink-3 [&>svg]:size-5">
        {icon}
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-xs text-[13px] leading-relaxed text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Inline notice used for warnings and errors inside panels. */
export function Notice({
  tone,
  children,
  action,
}: {
  tone: "warning" | "error";
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "note"}
      className={cn(
        "rounded-lg px-3 py-2.5 text-[13px] leading-snug",
        tone === "error" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
      )}
    >
      {children}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
