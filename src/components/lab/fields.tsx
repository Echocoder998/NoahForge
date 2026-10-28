function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function NumField({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const shown = Number.isInteger(step) ? String(Math.round(value)) : value.toFixed(step < 0.1 ? 2 : 1);
  return (
    <label className="block border-b border-line py-3">
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm">{label}</span>
        <span className="flex items-baseline gap-1 font-mono text-sm tabular-nums">
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={shown}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(clamp(n, min, max));
            }}
            className="w-16 bg-transparent text-right text-cyan outline-none"
            aria-label={label}
          />
          <span className="text-xs text-dust">{unit}</span>
        </span>
      </span>
      <input
        className="mt-1 w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} slider`}
      />
    </label>
  );
}

export function Seg({
  options,
  value,
  onChange,
  columns,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  columns: string;
}) {
  return (
    <div className={`grid gap-1 rounded-md bg-hangar p-1 ${columns}`}>
      {options.map((opt) => {
        const on = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`min-h-11 rounded-md px-2 text-sm ${on ? "bg-raised text-cyan text-glow" : "text-dust hover:text-paper"}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
