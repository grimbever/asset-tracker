import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Banner({ tone, children }: { tone: "ok" | "bad"; children: ReactNode }) {
  const toneClass = tone === "ok" ? "bg-green-soft text-green" : "bg-danger-soft text-danger";
  return (
    <p role="status" className={`rounded-2xl px-4 py-3 text-sm leading-6 ${toneClass}`}>
      {children}
    </p>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ink" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-ember text-white hover:opacity-90",
    ink: "bg-ink text-paper hover:opacity-90",
    ghost: "border border-line bg-card text-ink hover:bg-paper-deep",
    danger: "bg-danger text-white hover:opacity-90",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 items-center justify-center rounded-full px-4 py-2 text-base font-medium disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl border border-line bg-card px-3 py-3 text-base ${props.className ?? ""}`}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      <span>{label}</span>
      {children}
      {hint ? <span className="font-normal text-muted">{hint}</span> : null}
    </label>
  );
}
