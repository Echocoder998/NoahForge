import type { ReactNode } from "react";

export function SizingField({
  label,
  value,
  unit,
  onChange,
  min = 0,
  max = 100000,
  step = 1,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs text-dust">
        {label} <span className="font-mono">({unit})</span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => {
          const n = Number(event.target.value);
          if (event.target.value !== "" && Number.isFinite(n))
            onChange(Math.max(min, Math.min(max, n)));
        }}
        className="min-h-11 w-full min-w-0 rounded-md border border-line bg-hangar px-3 py-2 font-mono text-sm text-paper"
        aria-label={label}
      />
    </label>
  );
}

export function SizingMetric({
  label,
  value,
  unit,
  help,
}: {
  label: string;
  value: string;
  unit?: string;
  help?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-panel p-4">
      <p className="text-xs text-dust">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold tabular-nums">
        {value} {unit && <span className="text-sm font-normal text-dust">{unit}</span>}
      </p>
      {help && <p className="mt-1 text-xs text-dust">{help}</p>}
    </div>
  );
}

export function SizingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export const sizingFormat = (n: number | null, decimals = 1) =>
  n === null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
