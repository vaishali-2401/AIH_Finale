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
    <div className={cn("flex flex-col items-start px-5 py-8", className)}>
      <div className="mb-3 text-ink-3 [&>svg]:size-4" aria-hidden>
        {icon}
      </div>
      <p className="font-serif text-[17px] leading-snug text-ink">{title}</p>
      {children && <div className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-2">{children}</div>}
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
        "border-l-2 py-1 pl-3 text-[13px] leading-snug",
        tone === "error" ? "border-danger text-danger" : "border-ink text-ink-2",
      )}
    >
      {children}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
