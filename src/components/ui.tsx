import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn, initials } from "@/lib/utils";

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 md:px-8 md:py-8", className)}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[13px] text-ink-3">{eyebrow}</div>}
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink md:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-[var(--radius-card)] border border-hairline/70 bg-surface shadow-[var(--shadow-card)]", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3", className)}>{children}</h3>
  );
}

type Tone = "neutral" | "blue" | "green" | "orange" | "red" | "gold" | "violet" | "muted";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  muted: "bg-sunken text-ink-3",
  blue: "bg-blue-soft text-blue-ink",
  green: "bg-green-soft text-green-ink",
  orange: "bg-orange-soft text-orange-ink",
  red: "bg-red-soft text-red-ink",
  gold: "bg-gold-soft text-gold-ink",
  violet: "bg-violet-soft text-violet",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const BUTTON = {
  primary: "bg-blue text-white hover:bg-blue-ink shadow-sm",
  secondary: "bg-surface text-ink border border-hairline-strong hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-black/[0.05]",
  soft: "bg-blue-soft text-blue-ink hover:bg-[#dbe9ff]",
} as const;

export function buttonClass(variant: keyof typeof BUTTON = "secondary", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
    size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-9 px-3.5 text-[13.5px]",
    BUTTON[variant],
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof BUTTON; size?: "sm" | "md" }) {
  return <button className={cn(buttonClass(variant, size), className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof BUTTON; size?: "sm" | "md" }) {
  return <Link className={cn(buttonClass(variant, size), className)} {...props} />;
}

const AVATAR_COLORS = ["#0a7aff", "#7c5cff", "#ff9f0a", "#30b0c7", "#ff375f", "#34c759", "#5e5ce6", "#a2845e"];

export function Avatar({ name, size = 28, className }: { name: string | null | undefined; size?: number; className?: string }) {
  const hash = [...(name ?? "?")].reduce((h, ch) => h + ch.charCodeAt(0), 0);
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold text-white", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: name ? AVATAR_COLORS[hash % AVATAR_COLORS.length] : "#c7c7cc",
      }}
    >
      {initials(name)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse-soft rounded-lg bg-black/[0.06]", className)} />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-sunken text-ink-3">{icon}</div>}
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {children && <div className="mt-1 max-w-sm text-[13.5px] text-ink-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-hairline", className)} />;
}
