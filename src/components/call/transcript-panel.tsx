"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Search, X } from "lucide-react";
import type { SpeakerRole } from "@/lib/analysis/types";
import type { Utterance } from "@/lib/transcription/types";
import { cn, formatDuration } from "@/lib/utils";
import { usePlayer } from "./player-context";

export interface Marker {
  u: number;
  start: number;
  kind: "met" | "missed" | "risk" | "moment";
  label: string;
}

const MARK_COLOR: Record<Marker["kind"], string> = {
  met: "bg-green",
  missed: "bg-red",
  risk: "bg-orange",
  moment: "bg-blue",
};

export function TranscriptPanel({
  utterances,
  speakers,
  markers,
}: {
  utterances: Utterance[];
  speakers: { speaker: number; role: SpeakerRole; name: string | null }[];
  markers: Marker[];
}) {
  const { time, playing, duration, toggle, seek, focusU, focusNonce, rate, setRate } = usePlayer();
  // A search belongs to the jump it was typed after; jumping to a cited moment clears it.
  const [search, setSearch] = useState({ text: "", nonce: 0 });
  const query = search.nonce === focusNonce ? search.text : "";
  const setQuery = (text: string) => setSearch({ text, nonce: focusNonce });
  const [follow, setFollow] = useState(true);
  const list = useRef<HTMLDivElement>(null);
  // The jumped-to line glows until its timer marks that jump as seen.
  const [seenNonce, setSeenNonce] = useState(0);
  const flash = focusNonce !== seenNonce ? focusU : null;

  const who = useMemo(() => {
    const m = new Map<number, { role: SpeakerRole; label: string }>();
    for (const s of speakers) {
      const base = s.role === "rep" ? "Rep" : s.role === "customer" ? "Customer" : "Other";
      m.set(s.speaker, { role: s.role, label: s.name ? `${s.name}` : base });
    }
    return m;
  }, [speakers]);

  const marksByU = useMemo(() => {
    const m = new Map<number, Marker[]>();
    for (const mk of markers) m.set(mk.u, [...(m.get(mk.u) ?? []), mk]);
    return m;
  }, [markers]);

  const active = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < utterances.length; i++) {
      if (utterances[i].start <= time + 0.05) idx = i;
      else break;
    }
    return idx;
  }, [time, utterances]);

  // Follow playback.
  useEffect(() => {
    if (!follow || !playing || active < 0 || query) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-u="${active}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active, follow, playing, query]);

  // Jump from an evidence link.
  useEffect(() => {
    if (focusU === null) return;
    requestAnimationFrame(() => {
      list.current?.querySelector<HTMLElement>(`[data-u="${focusU}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const t = setTimeout(() => setSeenNonce(focusNonce), 2200);
    return () => clearTimeout(t);
  }, [focusU, focusNonce]);

  const q = query.trim().toLowerCase();
  const shown = q ? utterances.filter((u) => u.text.toLowerCase().includes(q)) : utterances;
  const total = duration || utterances.at(-1)?.end || 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Player */}
      <div className="border-b border-hairline px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-blue text-white shadow-sm transition hover:bg-blue-ink"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
          </button>
          <div className="min-w-0 flex-1">
            <Scrubber time={time} total={total} markers={markers} onSeek={(t) => seek(t, undefined, playing)} />
            <div className="mt-1 flex justify-between text-[11px] text-ink-3 tabular">
              <span>{formatDuration(time)}</span>
              <span>{formatDuration(total)}</span>
            </div>
          </div>
          <button
            onClick={() => setRate(rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1)}
            className="h-7 shrink-0 rounded-[8px] bg-sunken px-2 text-[12px] font-semibold text-ink-2 tabular hover:bg-black/[0.07]"
            aria-label="Playback speed"
          >
            {rate}×
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label className="flex h-8 flex-1 items-center gap-2 rounded-[9px] bg-sunken px-2.5 text-[13px]">
            <Search className="size-3.5 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search transcript"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-4"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search">
                <X className="size-3.5 text-ink-3" />
              </button>
            )}
          </label>
          <button
            onClick={() => setFollow((f) => !f)}
            className={cn(
              "h-8 shrink-0 rounded-[9px] px-2.5 text-[12px] font-medium",
              follow ? "bg-blue-soft text-blue-ink" : "bg-sunken text-ink-3",
            )}
          >
            Follow along
          </button>
        </div>
        {q && <div className="mt-2 text-[12px] text-ink-3">{shown.length} matching lines</div>}
      </div>

      {/* Lines */}
      <div ref={list} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {shown.length === 0 && <div className="px-3 py-8 text-center text-[13px] text-ink-3">No speech found.</div>}
        {shown.map((u) => {
          const w = who.get(u.speaker) ?? { role: "other" as SpeakerRole, label: `Speaker ${u.speaker + 1}` };
          const isActive = u.i === active;
          const marks = marksByU.get(u.i);
          return (
            <button
              key={u.i}
              data-u={u.i}
              onClick={() => seek(u.start, u.i)}
              className={cn(
                "group flex w-full gap-3 rounded-[12px] px-2.5 py-2 text-left transition-colors",
                isActive ? "bg-blue-soft/70" : "hover:bg-sunken",
                flash === u.i && "ring-2 ring-blue/60 ring-offset-1",
              )}
            >
              <div className="w-[42px] shrink-0 pt-[2px] text-[11px] text-ink-4 tabular group-hover:text-blue">
                {formatDuration(u.start)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-[11.5px] font-semibold",
                      w.role === "rep" ? "text-blue-ink" : w.role === "customer" ? "text-ink-2" : "text-ink-4",
                    )}
                  >
                    {w.label}
                    {w.role === "rep" && w.label !== "Rep" ? <span className="font-normal text-ink-4"> · Rep</span> : null}
                  </span>
                  {marks?.map((m, i) => (
                    <span key={i} title={m.label} className={cn("size-1.5 rounded-full", MARK_COLOR[m.kind])} />
                  ))}
                </div>
                <p className={cn("mt-0.5 text-[13.5px] leading-relaxed", w.role === "rep" ? "text-ink" : "text-ink-2")}>
                  {q ? highlight(u.text, q) : u.text}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Scrubber({
  time,
  total,
  markers,
  onSeek,
}: {
  time: number;
  total: number;
  markers: Marker[];
  onSeek: (t: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const at = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * total;
  };
  return (
    <div
      ref={bar}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={Math.round(time)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onSeek(Math.min(total, time + 5));
        if (e.key === "ArrowLeft") onSeek(Math.max(0, time - 5));
      }}
      onPointerDown={(e) => {
        onSeek(at(e.clientX));
        const move = (ev: PointerEvent) => onSeek(at(ev.clientX));
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      className="relative h-5 cursor-pointer touch-none"
    >
      <div className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-black/[0.08]">
        <div className="h-full rounded-full bg-blue" style={{ width: `${(time / total) * 100}%` }} />
      </div>
      {markers.map((m, i) => (
        <span
          key={i}
          title={`${formatDuration(m.start)} · ${m.label}`}
          className={cn("pointer-events-none absolute top-[1px] h-[6px] w-[2px] rounded-full", MARK_COLOR[m.kind])}
          style={{ left: `${(m.start / total) * 100}%` }}
        />
      ))}
      <span
        className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue shadow"
        style={{ left: `${(time / total) * 100}%` }}
      />
    </div>
  );
}

function highlight(text: string, q: string) {
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  let i = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, i)) {
    parts.push(text.slice(i, at), <mark key={at} className="rounded bg-[#ffe58f] px-0.5 text-ink">{text.slice(at, at + q.length)}</mark>);
    i = at + q.length;
  }
  parts.push(text.slice(i));
  return parts;
}
