"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "quiet";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-text-inverse hover:bg-accent-hover shadow-[var(--shadow-card)]",
  secondary: "bg-control text-text-inverse hover:bg-control-hover",
  quiet: "text-text-muted hover:bg-surface-sunken hover:text-text",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "primary", className = "", ...rest }: ButtonProps) {
  return <button className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`} {...rest} />;
}

/** Square control for an action the icon already names, so the label stays out of the button. */
export function IconButton({
  label,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Padding lives at the call site so grid cards can run their artwork edge to edge. */
export function Card({ children, className = "p-5" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[var(--radius-card)] bg-surface-raised shadow-[var(--shadow-card)] ${className}`}>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-text">{label}</span>
      {children}
    </label>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-[var(--radius-control)] border border-edge-strong bg-surface-raised px-3 py-2 text-sm text-text placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${className}`}
      {...rest}
    />
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  const tones = {
    neutral: "bg-surface-sunken text-text-muted",
    accent: "bg-accent-soft text-accent-strong",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** A pill the reader can switch off, used where each option changes what gets mined. */
/**
 * `tone` decides what "off" means. Options that start accepted and get removed read as struck
 * out; options that start unselected and get added must not, or an untouched picker looks like
 * a list of things the reader rejected.
 */
export function TogglePill({
  active,
  label,
  tone = "opt-out",
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  tone?: "opt-in" | "opt-out";
  onClick: () => void;
  children: ReactNode;
}) {
  const inactive =
    tone === "opt-out"
      ? "bg-inert text-text-subtle line-through hover:bg-inert-hover hover:text-text-muted"
      : "bg-inert text-text-muted hover:bg-inert-hover hover:text-text";

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active ? "bg-accent text-text-inverse" : inactive
      }`}
    >
      {children}
    </button>
  );
}

/** A hover card rather than a native tooltip, and reachable by keyboard. */
export function Hint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        role="button"
        aria-label={text}
        className="inline-flex size-4 cursor-help items-center justify-center rounded-full bg-inert-raised text-[10px] font-bold text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        ?
      </span>
      <span className="pointer-events-none absolute top-full left-1/2 z-30 mt-2 w-60 -translate-x-1/2 rounded-[var(--radius-control)] bg-control px-3 py-2 text-xs leading-relaxed font-normal text-text-inverse opacity-0 shadow-[var(--shadow-lift)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  );
}
