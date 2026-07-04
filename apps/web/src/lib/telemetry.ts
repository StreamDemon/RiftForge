import { createSignal, type Accessor } from "solid-js";

export type TelemetryTone = "machine" | "magic" | "good" | "bad" | "dim";

export interface TelemetryEntry {
  id: number;
  text: string;
  tone: TelemetryTone;
}

const MAX_ENTRIES = 60;

/**
 * The dossier's field-telemetry log: every roll prints here, newest last.
 * Ephemeral by design — gameplay rolls are moments at the table, not records
 * (only `rollVitals` persists, via its mutation).
 */
export function createTelemetry(boot: string[] = []): {
  entries: Accessor<TelemetryEntry[]>;
  log: (text: string, tone?: TelemetryTone) => void;
  /** Back to the boot lines — e.g. when the dossier switches characters. */
  reset: () => void;
} {
  let nextId = 0;
  const bootEntries = () => boot.map((text) => ({ id: nextId++, text, tone: "dim" as const }));
  const [entries, setEntries] = createSignal<TelemetryEntry[]>(bootEntries());
  const log = (text: string, tone: TelemetryTone = "machine") =>
    setEntries((current) => [...current, { id: nextId++, text, tone }].slice(-MAX_ENTRIES));
  const reset = () => setEntries(bootEntries());
  return { entries, log, reset };
}

/** "horrorFactor" -> "HORROR FACTOR" for the machine voice. */
export function machineName(key: string): string {
  return key.replace(/([A-Z])/g, " $1").toUpperCase();
}

/** `d20[14]+3 = 17 vs 15+ ✓` — the standard d20 telemetry fragment. */
export function d20Line(roll: {
  die: number;
  bonus: number;
  total: number;
  target?: number;
  success?: boolean;
  naturalTwenty: boolean;
  naturalOne: boolean;
}): string {
  const bonus = roll.bonus >= 0 ? `+${roll.bonus}` : `${roll.bonus}`;
  const verdict =
    roll.target !== undefined ? ` vs ${roll.target}+ ${roll.success ? "✓" : "✗"}` : "";
  const nat = roll.naturalTwenty ? " — NAT 20" : roll.naturalOne ? " — NAT 1" : "";
  return `d20[${roll.die}]${bonus} = ${roll.total}${verdict}${nat}`;
}
