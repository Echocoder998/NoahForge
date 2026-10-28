import { Minus, Plus } from "lucide-react";
import { DEVICES, GROUPS, MCUS, type DeviceId, type McuId } from "@/lib/wire/catalog";
import { countOf, type WireKind } from "@/lib/wire/plan";
import { useBenchPlan, useLab } from "@/lib/lab-store";

const KIND: Record<WireKind, string> = {
  power: "bg-magenta",
  ground: "bg-dust",
  signal: "bg-cyan",
  i2c: "bg-paper",
  uart: "bg-paper",
};

export function WireBench() {
  const mcu = useLab((s) => s.mcu);
  const picked = useLab((s) => s.picked);
  const setMcu = useLab((s) => s.setMcu);
  const setDevice = useLab((s) => s.setDevice);
  const plan = useBenchPlan();
  const faults = plan.issues.filter((i) => i.level === "fault");
  const cautions = plan.issues.filter((i) => i.level === "caution");

  return (
    <div className="grid gap-4 md:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="min-w-0 rounded-md border border-line bg-panel p-4">
        <p className="font-mono text-xs tracking-widest text-dust">BRAIN</p>
        <div className="mt-2 grid gap-2">
          {MCUS.map((m) => {
            const on = m.id === mcu;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMcu(m.id)}
                className={`min-h-11 rounded-md border px-3 py-2 text-left ${on ? "border-cyan bg-raised" : "border-line"}`}
              >
                <span className="block text-sm">{m.name}</span>
                <span className="block text-xs text-dust">{m.blurb}</span>
              </button>
            );
          })}
        </div>
        {GROUPS.map((group) => (
          <div key={group} className="mt-5">
            <p className="font-mono text-xs tracking-widest text-dust">{group.toUpperCase()}</p>
            <ul className="mt-2 grid gap-2">
              {DEVICES.filter((d) => d.group === group).map((d) => (
                <DeviceRow
                  key={d.id}
                  id={d.id}
                  name={d.name}
                  blurb={d.blurb}
                  max={d.max}
                  count={countOf(picked, d.id)}
                  onChange={(n) => setDevice(d.id, n)}
                />
              ))}
            </ul>
          </div>
        ))}
      </section>

      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-md border border-line bg-panel p-4">
          <h2 className="text-base font-medium">
            {faults.length === 0 ? "No hard faults" : `${faults.length} fault${faults.length === 1 ? "" : "s"} — do not power this`}
          </h2>
          <p className="mt-1 text-sm text-dust">
            Catalog currents, not a sign-off. Match the silkscreen, then the datasheet.
          </p>
          <ul className="mt-3 grid gap-2">
            {faults.map((issue) => (
              <li key={issue.title} className="rounded-md border border-line border-l-4 border-l-magenta px-3 py-2">
                <p className="text-sm font-medium">{issue.title}</p>
                <p className="text-sm text-dust">{issue.detail}</p>
              </li>
            ))}
            {cautions.map((issue) => (
              <li key={issue.title} className="rounded-md border border-line border-l-4 border-l-cyan px-3 py-2">
                <p className="text-sm font-medium">{issue.title}</p>
                <p className="text-sm text-dust">{issue.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        {plan.rails.map((rail) => {
          const pct = rail.budgetMa > 0 ? Math.min(100, Math.round((rail.continuousMa / rail.budgetMa) * 100)) : 0;
          const hot = rail.continuousMa > rail.budgetMa;
          return (
            <section key={rail.name} className="rounded-md border border-line bg-panel p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-medium">{rail.name}</h2>
                <p className="font-mono text-xs tabular-nums text-dust">
                  {rail.continuousMa} / {rail.budgetMa} mA steady · {rail.peakMa} mA if everything stalls
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-hangar">
                <div className={`h-full ${hot ? "bg-magenta" : "bg-cyan"}`} style={{ width: `${Math.max(pct, 4)}%` }} />
              </div>
            </section>
          );
        })}

        <section className="rounded-md border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 text-sm font-medium">{mcuLabel(mcu)} pins in use</h2>
          {plan.pins.length === 0 ? (
            <p className="px-4 py-4 text-sm text-dust">Add a servo, sensor, or receiver to assign pins.</p>
          ) : (
            <ul>
              {plan.pins.map((pin) => (
                <li key={`${pin.pin}-${pin.goesTo}`} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                  <span className="font-mono text-sm text-cyan">{pin.pin}</span>
                  <span className="text-right text-sm">{pin.goesTo}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 text-sm font-medium">Wire list</h2>
          <ul>
            {plan.wires.map((wire) => (
              <li key={wire.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <span className={`size-2.5 shrink-0 rounded-full ${KIND[wire.kind]}`} />
                <span className="min-w-0 flex-1 text-sm">
                  {wire.from}
                  <span className="text-dust"> → </span>
                  {wire.to}
                </span>
                <span className="font-mono text-xs text-dust">{wire.kind}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function DeviceRow({
  id,
  name,
  blurb,
  max,
  count,
  onChange,
}: {
  id: DeviceId;
  name: string;
  blurb: string;
  max: number;
  count: number;
  onChange: (count: number) => void;
}) {
  return (
    <li data-device={id} className="rounded-md border border-line bg-hangar px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">{name}</p>
          <p className="text-xs text-dust">{blurb}</p>
        </div>
        {max === 1 ? (
          <button
            type="button"
            onClick={() => onChange(count > 0 ? 0 : 1)}
            className={`min-h-11 shrink-0 rounded-md border px-3 text-sm ${count > 0 ? "border-cyan text-cyan" : "border-line text-dust"}`}
          >
            {count > 0 ? "On" : "Off"}
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={`Fewer ${name}`}
              onClick={() => onChange(Math.max(0, count - 1))}
              className="flex size-11 items-center justify-center rounded-md border border-line"
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="w-6 text-center font-mono text-sm tabular-nums">{count}</span>
            <button
              type="button"
              aria-label={`More ${name}`}
              onClick={() => onChange(Math.min(max, count + 1))}
              className="flex size-11 items-center justify-center rounded-md border border-line"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function mcuLabel(id: McuId): string {
  return MCUS.find((m) => m.id === id)?.name ?? id;
}
