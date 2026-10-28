"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Ellipsis, Loader2, RotateCw, Trash2, X } from "lucide-react";
import { deleteCall, overrideCallType, overrideItem, reprocessCall } from "@/app/actions";
import { CALL_TYPE_LABEL, CALL_TYPES, type CallType } from "@/lib/analysis/taxonomy";
import { cn } from "@/lib/utils";

function useClickAway(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, close]);
  return ref;
}

/** Manager override for one scorecard step. */
export function ItemOverride({
  callId,
  itemId,
  credited,
  overridden,
}: {
  callId: string;
  itemId: string;
  credited: boolean;
  overridden: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useClickAway(open, () => setOpen(false));
  const run = (v: boolean | null) => {
    setOpen(false);
    start(() => overrideItem(callId, itemId, v));
  };
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid size-7 place-items-center rounded-[8px] text-ink-4 opacity-0 transition group-hover:opacity-100 hover:bg-sunken hover:text-ink-2 focus:opacity-100 data-[open=true]:opacity-100"
        data-open={open || pending}
        aria-label="Adjust this step"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Ellipsis className="size-4" />}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-48 rounded-[12px] border border-hairline bg-surface p-1 text-[13px] shadow-[var(--shadow-pop)]">
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-ink-4 uppercase">Manager review</div>
          {!credited && (
            <MenuItem onClick={() => run(true)} icon={<Check className="size-3.5 text-green-ink" />}>
              Award this point
            </MenuItem>
          )}
          {credited && (
            <MenuItem onClick={() => run(false)} icon={<X className="size-3.5 text-red-ink" />}>
              Remove this point
            </MenuItem>
          )}
          {overridden && (
            <MenuItem onClick={() => run(null)} icon={<RotateCw className="size-3.5" />}>
              Reset to AI result
            </MenuItem>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, icon, children, danger }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn("flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left hover:bg-sunken", danger && "text-red-ink")}
    >
      {icon}
      {children}
    </button>
  );
}

export function CallActions({ callId, callType, typeOverridden }: { callId: string; callType: CallType | null; typeOverridden: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useClickAway(open, () => setOpen(false));

  const act = (label: string, fn: () => Promise<void>) => {
    setOpen(false);
    setBusy(label);
    start(async () => {
      await fn();
      setBusy(null);
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-hairline-strong bg-surface px-3 text-[13.5px] font-medium hover:bg-sunken disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Ellipsis className="size-4" />}
        {pending ? busy : "Review"}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-64 rounded-[12px] border border-hairline bg-surface p-1 text-[13px] shadow-[var(--shadow-pop)]">
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-ink-4 uppercase">Correct the call type</div>
          <div className="max-h-56 overflow-y-auto">
            {CALL_TYPES.map((t) => (
              <MenuItem
                key={t}
                onClick={() => t !== callType && act("Re-scoring…", () => overrideCallType(callId, t))}
                icon={<Check className={cn("size-3.5", t === callType ? "text-blue" : "opacity-0")} />}
              >
                {CALL_TYPE_LABEL[t]}
              </MenuItem>
            ))}
          </div>
          {typeOverridden && (
            <MenuItem onClick={() => act("Re-scoring…", () => overrideCallType(callId, null))} icon={<RotateCw className="size-3.5" />}>
              Use AI call type
            </MenuItem>
          )}
          <div className="my-1 h-px bg-hairline" />
          <MenuItem onClick={() => act("Queued…", () => reprocessCall(callId))} icon={<RotateCw className="size-3.5" />}>
            Re-run analysis
          </MenuItem>
          <MenuItem onClick={() => act("Queued…", () => reprocessCall(callId, true))} icon={<RotateCw className="size-3.5" />}>
            Re-transcribe and analyze
          </MenuItem>
          <MenuItem
            danger
            onClick={() => {
              if (!confirm("Delete this call, its transcript and analysis? This can't be undone.")) return;
              act("Deleting…", async () => {
                await deleteCall(callId);
                router.push("/calls");
              });
            }}
            icon={<Trash2 className="size-3.5" />}
          >
            Delete call
          </MenuItem>
        </div>
      )}
    </div>
  );
}

/** Refreshes the page while a call is being processed. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

export function RetryCall({ callId }: { callId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => reprocessCall(callId))}
      disabled={pending}
      className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-blue px-3.5 text-[13.5px] font-medium text-white hover:bg-blue-ink disabled:opacity-60"
    >
      <RotateCw className={cn("size-4", pending && "animate-spin")} /> Try again
    </button>
  );
}
