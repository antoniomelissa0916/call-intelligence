import Link from "next/link";
import { cn } from "@/lib/utils";

/** Tiny per-call score bars, oldest → newest. */
export function SparkBars({
  points,
  height = 28,
  linked = false,
}: {
  points: { callId: string; label: string; pct: number }[];
  height?: number;
  linked?: boolean;
}) {
  if (!points.length) return <span className="text-[12px] text-ink-4">—</span>;
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {points.map((p) => {
        const bar = (
          <span
            className={cn("block w-[6px] rounded-[2px]", p.pct >= 0.99 ? "bg-gold" : p.pct >= 0.9 ? "bg-green" : p.pct >= 0.75 ? "bg-orange" : "bg-red")}
            style={{ height: Math.max(3, p.pct * height) }}
          />
        );
        return linked ? (
          <Link key={p.callId} href={`/calls/${p.callId}`} title={`${p.label}: ${Math.round(p.pct * 100)}%`} className="hover:opacity-70">
            {bar}
          </Link>
        ) : (
          <span key={p.callId} title={`${p.label}: ${Math.round(p.pct * 100)}%`}>
            {bar}
          </span>
        );
      })}
    </div>
  );
}
