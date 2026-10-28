"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface PlayerState {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  time: number;
  playing: boolean;
  duration: number;
  /** Utterance the user jumped to; the transcript scrolls to and flashes it. */
  focusU: number | null;
  focusNonce: number;
  seek: (sec: number, u?: number, play?: boolean) => void;
  toggle: () => void;
  setRate: (r: number) => void;
  rate: number;
}

const Ctx = createContext<PlayerState | null>(null);

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}

export function PlayerProvider({ src, initialDuration, children }: { src: string; initialDuration: number; children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(initialDuration);
  const [focus, setFocus] = useState<{ u: number | null; n: number }>({ u: null, n: 0 });
  const [rate, setRateState] = useState(1);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onMeta = () => Number.isFinite(a.duration) && setDuration(a.duration);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("loadedmetadata", onMeta);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("loadedmetadata", onMeta);
    };
  }, []);

  const seek = useCallback((sec: number, u?: number, play = true) => {
    const a = audioRef.current;
    if (a) {
      a.currentTime = Math.max(0, sec - 0.3);
      setTime(a.currentTime);
      if (play) void a.play().catch(() => {});
    }
    if (u !== undefined) setFocus((f) => ({ u, n: f.n + 1 }));
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }, []);

  const setRate = useCallback((r: number) => {
    if (audioRef.current) audioRef.current.playbackRate = r;
    setRateState(r);
  }, []);

  // Space toggles playback when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.code !== "Space" || /input|textarea|select|button/i.test(el.tagName) || el.isContentEditable) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = useMemo(
    () => ({ audioRef, time, playing, duration, focusU: focus.u, focusNonce: focus.n, seek, toggle, rate, setRate }),
    [time, playing, duration, focus, seek, toggle, rate, setRate],
  );

  return (
    <Ctx.Provider value={value}>
      <audio ref={audioRef} src={src} preload="metadata" />
      {children}
    </Ctx.Provider>
  );
}
