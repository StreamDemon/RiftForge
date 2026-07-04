import { splitProps, type ComponentProps, type JSX, type ParentProps } from "solid-js";

/**
 * Ley Terminal primitives (DESIGN.md). Notched corners via clip-path — no
 * border-radius anywhere. Color is semantic: amber = the machine's voice,
 * ley cyan = magic only, blood = damage, ok = confirmed.
 */

/** A chassis panel: surface, hairline border, phosphor top-edge accent. */
export function Panel(props: ParentProps<{ class?: string }>) {
  return (
    <section
      class={`notch-12 panel-accent relative border border-line bg-surface ${props.class ?? ""}`}
    >
      {props.children}
    </section>
  );
}

/** Staatliches section header: `// TITLE` with the slashes in dead-steel. */
export function SectionTitle(props: ParentProps<{ class?: string }>) {
  return (
    <h2 class={`font-display text-[17px] tracking-[0.12em] text-muted ${props.class ?? ""}`}>
      <span class="text-dead">// </span>
      {props.children}
    </h2>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonClass: Record<ButtonVariant, string> = {
  primary:
    "notch-8 bg-amber font-hud text-[13px] font-bold uppercase tracking-[0.08em] text-[#191104] hover:brightness-110 disabled:bg-dead disabled:text-noir",
  secondary:
    "notch-8 border border-line bg-inset font-hud text-[13px] font-bold uppercase tracking-[0.08em] text-fg hover:border-muted disabled:text-dead",
  ghost:
    "font-hud text-[13px] font-semibold text-amber underline underline-offset-4 hover:brightness-110 disabled:text-dead",
};

export function Button(props: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  const [own, rest] = splitProps(props, ["variant", "class", "children"]);
  return (
    <button
      type="button"
      class={`cursor-pointer px-5 py-2 disabled:cursor-not-allowed ${buttonClass[own.variant ?? "secondary"]} ${own.class ?? ""}`}
      {...rest}
    >
      {own.children}
    </button>
  );
}

export function TextInput(props: ComponentProps<"input">) {
  const [own, rest] = splitProps(props, ["class"]);
  return (
    <input
      type="text"
      class={`notch-8 border border-line bg-noir px-3 py-2 font-mono text-[13px] text-fg placeholder:text-dead focus:border-amber ${own.class ?? ""}`}
      {...rest}
    />
  );
}

type AlertTone = "ok" | "warn" | "danger" | "info";

const alertClass: Record<AlertTone, string> = {
  ok: "border-ok text-ok bg-ok/5",
  warn: "border-amber text-amber bg-amber/5",
  danger: "border-blood text-blood-text bg-blood/10",
  info: "border-ley text-ley bg-ley/5",
};

const alertMark: Record<AlertTone, string> = {
  ok: "✓",
  warn: "!",
  danger: "✕",
  info: "◈",
};

/** Terminal status line: mono voice, left signal bar. Danger interrupts
 * screen readers; other tones announce politely. */
export function Alert(props: ParentProps<{ tone: AlertTone; class?: string }>) {
  return (
    <p
      role={props.tone === "danger" ? "alert" : "status"}
      aria-live={props.tone === "danger" ? "assertive" : "polite"}
      class={`border-l-3 px-3 py-2 font-mono text-[12.5px] ${alertClass[props.tone]} ${props.class ?? ""}`}
    >
      {alertMark[props.tone]} {props.children}
    </p>
  );
}

/** Trait / tag chip. `tone` follows the signal rules. */
export function Chip(props: ParentProps<{ tone?: "default" | "ley" | "warn"; class?: string }>) {
  const tone = () =>
    props.tone === "ley"
      ? "text-ley border-ley/40"
      : props.tone === "warn"
        ? "text-amber border-amber/40"
        : "text-fg border-line";
  return (
    <span
      class={`notch-6 inline-block border bg-inset px-2.5 py-1 font-hud text-[11.5px] font-semibold uppercase tracking-[0.08em] ${tone()} ${props.class ?? ""}`}
    >
      {props.children}
    </span>
  );
}

/** Mono machine-voice caption (labels, kickers, file numbers). */
export function MonoLabel(props: ParentProps<{ class?: string }>) {
  return (
    <span
      class={`font-mono text-[11.5px] tracking-[0.14em] text-muted uppercase ${props.class ?? ""}`}
    >
      {props.children}
    </span>
  );
}

/** Big Martian Mono number with its label — stats are the heroes. */
export function DataValue(props: {
  label: JSX.Element;
  value: JSX.Element;
  live?: boolean;
  class?: string;
}) {
  return (
    <div class={`notch-6 border border-line bg-inset px-2 py-1.5 text-center ${props.class ?? ""}`}>
      <b
        class={`block font-data text-[19px] font-extrabold ${props.live ? "text-ley [text-shadow:0_0_10px_rgb(79_216_255/0.6)]" : "text-fg"}`}
      >
        {props.value}
      </b>
      <span class="font-mono text-[9.5px] tracking-[0.1em] text-muted">{props.label}</span>
    </div>
  );
}
