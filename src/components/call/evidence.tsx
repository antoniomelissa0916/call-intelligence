"use client";

import { Play, TriangleAlert } from "lucide-react";
import type { Evidence } from "@/lib/analysis/types";
import { cn, formatDuration } from "@/lib/utils";
import { usePlayer } from "./player-context";

/** A cited moment from the call. Click to hear it. */
export function EvidenceQuote({ e, className, tone = "neutral" }: { e: Evidence; className?: string; tone?: "neutral" | "good" | "bad" }) {
  const { seek } = usePlayer();
  return (
    <button
      type="button"
      onClick={() => seek(e.start, e.u)}
      title={e.verified ? "Play this moment" : "This quote could not be matched to the transcript"}
      className={cn(
        "group flex w-full items-start gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-[12.5px] leading-snug transition-colors",
        e.verified ? "bg-sunken hover:bg-blue-soft" : "bg-orange-soft/70 hover:bg-orange-soft",
        className,
      )}
    >
      <span
        className={cn(
          "mt-[1px] inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-semibold tabular",
          tone === "good" ? "bg-green-soft text-green-ink" : tone === "bad" ? "bg-red-soft text-red-ink" : "bg-surface text-ink-2",
          "group-hover:bg-blue group-hover:text-white",
        )}
      >
        <Play className="size-2.5 fill-current" />
        {formatDuration(e.start)}
      </span>
      <span className="min-w-0 text-ink-2">
        <span className="text-ink-4">{e.role === "rep" ? "Rep" : e.role === "customer" ? "Customer" : "Other"}: </span>“{e.quote}”
        {!e.verified && (
          <span className="ml-1 inline-flex items-center gap-0.5 text-orange-ink">
            <TriangleAlert className="size-3" /> unverified
          </span>
        )}
      </span>
    </button>
  );
}

/** Compact timestamp link. */
export function JumpTo({ e, label }: { e: Evidence; label?: string }) {
  const { seek } = usePlayer();
  return (
    <button
      type="button"
      onClick={() => seek(e.start, e.u)}
      className="inline-flex h-[20px] items-center gap-1 rounded-full bg-sunken px-1.5 text-[11px] font-semibold text-ink-2 tabular hover:bg-blue hover:text-white"
    >
      <Play className="size-2.5 fill-current" />
      {label ?? formatDuration(e.start)}
    </button>
  );
}
