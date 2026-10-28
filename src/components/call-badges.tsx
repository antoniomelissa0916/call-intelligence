import { GRADE_LABEL, type Grade } from "@/lib/analysis/rubrics";
import {
  CALL_TYPE_LABEL,
  OUTCOME_LABEL,
  OUTCOME_TONE,
  type CallType,
  type Outcome,
} from "@/lib/analysis/taxonomy";
import type { ScorecardResult } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";
import { Badge } from "./ui";

const TYPE_TONE: Record<CallType, Parameters<typeof Badge>[0]["tone"]> = {
  new_customer: "violet",
  scheduling: "blue",
  billing: "neutral",
  reservice: "orange",
  retention: "red",
  other: "neutral",
  not_scoreable: "muted",
};

export function CallTypeBadge({ type, className }: { type: CallType; className?: string }) {
  return (
    <Badge tone={TYPE_TONE[type]} className={className}>
      {CALL_TYPE_LABEL[type]}
    </Badge>
  );
}

export function OutcomeBadge({ outcome, className }: { outcome: Outcome; className?: string }) {
  const tone = OUTCOME_TONE[outcome];
  return (
    <Badge
      dot
      className={className}
      tone={tone === "positive" ? "green" : tone === "negative" ? "red" : tone === "neutral" ? "orange" : "muted"}
    >
      {OUTCOME_LABEL[outcome]}
    </Badge>
  );
}

export const GRADE_STYLE: Record<Grade, { text: string; bg: string; ring: string; solid: string }> = {
  gold: { text: "text-gold-ink", bg: "bg-gold-soft", ring: "#c9971c", solid: "bg-gold" },
  green: { text: "text-green-ink", bg: "bg-green-soft", ring: "#28a745", solid: "bg-green" },
  below: { text: "text-red-ink", bg: "bg-red-soft", ring: "#ff3b30", solid: "bg-red" },
};

/** "11/12 · Green" pill used in lists. */
export function ScorePill({
  value,
  className,
}: {
  value: Pick<ScorecardResult, "score" | "max" | "grade"> | null;
  className?: string;
}) {
  if (!value) {
    return <span className={cn("text-[12.5px] text-ink-4", className)}>Not graded</span>;
  }
  const s = GRADE_STYLE[value.grade];
  return (
    <span
      title={GRADE_LABEL[value.grade]}
      className={cn("inline-flex h-[24px] items-center gap-1.5 rounded-full pr-2.5 pl-1 text-[12.5px] font-semibold tabular", s.bg, s.text, className)}
    >
      <span className={cn("grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] text-white", s.solid)}>
        {value.grade === "gold" ? "★" : value.grade === "green" ? "✓" : "!"}
      </span>
      {value.score}/{value.max}
    </span>
  );
}

/** Circular score with the grade colour. */
export function ScoreRing({
  score,
  max,
  grade,
  size = 88,
  stroke = 8,
}: {
  score: number;
  max: number;
  grade: Grade;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = max ? score / max : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ececf0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={GRADE_STYLE[grade].ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display text-[22px] leading-none font-semibold tabular text-ink" style={{ fontSize: size * 0.26 }}>
            {score}
            <span className="text-ink-4" style={{ fontSize: size * 0.16 }}>
              /{max}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GradeLabel({ grade, className }: { grade: Grade; className?: string }) {
  return <span className={cn("font-semibold", GRADE_STYLE[grade].text, className)}>{GRADE_LABEL[grade]}</span>;
}
