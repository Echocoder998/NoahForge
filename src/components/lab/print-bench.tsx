import { useMemo } from "react";
import { Download } from "lucide-react";
import { meshSize, signedVolume } from "@/lib/aero/mesh";
import { nacaLabel, partMesh, partRings, type PartKind } from "@/lib/aero/parts";
import { downloadBlob, meshToStl, slug } from "@/lib/aero/stl";
import { useActiveDesign, useLab, type Filament } from "@/lib/lab-store";
import { chassisById } from "@/lib/robots/chassis";
import { NumField, Seg } from "./fields";
import { Viewport } from "./viewport";

const PARTS: { id: PartKind; label: string }[] = [
  { id: "rib", label: "Rib" },
  { id: "motor", label: "Motor" },
  { id: "horn", label: "Horn" },
  { id: "plate", label: "Plate" },
  { id: "clip", label: "Clip" },
];

const FILAMENTS: { id: Filament; label: string; hex: string; swatch: string }[] = [
  { id: "natural", label: "Natural", hex: "#e4d2ae", swatch: "bg-pla-natural" },
  { id: "white", label: "White", hex: "#f4f1ea", swatch: "bg-pla-white" },
  { id: "orange", label: "Orange", hex: "#e25b1a", swatch: "bg-pla-orange" },
  { id: "black", label: "Black", hex: "#2c2c2a", swatch: "bg-pla-black" },
];

const CODES = ["0012", "2412", "4412", "0015"];

export function PrintBench() {
  const part = useLab((s) => s.part);
  const filament = useLab((s) => s.filament);
  const rib = useLab((s) => s.rib);
  const motor = useLab((s) => s.motor);
  const horn = useLab((s) => s.horn);
  const plate = useLab((s) => s.plate);
  const clip = useLab((s) => s.clip);
  const name = useLab((s) => s.projectName);
  const spanMm = useLab((s) => s.spanMm);
  const massG = useLab((s) => s.massG);
  const speedMs = useLab((s) => s.speedMs);
  const setPart = useLab((s) => s.setPart);
  const setFilament = useLab((s) => s.setFilament);
  const patchRib = useLab((s) => s.patchRib);
  const patchMotor = useLab((s) => s.patchMotor);
  const patchHorn = useLab((s) => s.patchHorn);
  const patchPlate = useLab((s) => s.patchPlate);
  const patchClip = useLab((s) => s.patchClip);
  const setSpan = useLab((s) => s.setSpan);
  const setMass = useLab((s) => s.setMass);
  const setSpeed = useLab((s) => s.setSpeed);
  const design = useActiveDesign();
  const builtinName = chassisById(useLab((s) => s.chassis)).name;
  const chassisName = (design ? design.name : builtinName).toLowerCase();

  const rings = useMemo(
    () => partRings(part, rib, motor, horn, plate, clip),
    [part, rib, motor, horn, plate, clip],
  );
  const mesh = useMemo(
    () => partMesh(part, rib, motor, horn, plate, clip),
    [part, rib, motor, horn, plate, clip],
  );
  const color = FILAMENTS.find((f) => f.id === filament)?.hex ?? "#e4d2ae";
  const volume = Math.abs(signedVolume(mesh.positions, mesh.indices));
  const size = meshSize(mesh.positions);
  const grams = (volume / 1000) * 1.24;
  const tris = mesh.indices.length / 3;

  const save = () => {
    const file = `${slug(name)}-${part}.stl`;
    downloadBlob(file, meshToStl(mesh.positions, mesh.indices, file), "model/stl");
  };

  return (
    <div className="grid gap-4 md:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="order-2 min-w-0 rounded-md border border-line bg-panel p-4 md:order-1">
        <p className="font-mono text-xs tracking-widest text-dust">PART</p>
        <p className="mt-2 text-sm text-dust">One printable piece of the {chassisName}. The frame bench is the whole machine.</p>
        <div className="mt-2">
          <Seg options={PARTS} value={part} onChange={(id) => setPart(id as PartKind)} columns="grid-cols-5" />
        </div>
        <Profile outer={rings.outer} holes={rings.holes} />
        {part === "rib" && (
          <>
            <label className="mt-3 block">
              <span className="text-sm">NACA 4-digit</span>
              <input
                value={rib.code}
                maxLength={4}
                inputMode="numeric"
                onChange={(e) => patchRib({ code: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                className="mt-1 w-full rounded-md border border-line bg-hangar px-3 py-3 font-mono text-cyan outline-none"
              />
            </label>
            <p className="mt-1 text-xs text-dust">{nacaLabel(rib.code)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => patchRib({ code })}
                  className={`min-h-11 rounded-md border px-3 font-mono text-sm ${rib.code === code ? "border-cyan text-cyan" : "border-line text-dust"}`}
                >
                  {code}
                </button>
              ))}
            </div>
            <NumField label="Chord" unit="mm" value={rib.chord} min={60} max={280} step={1} onChange={(chord) => patchRib({ chord })} />
            <NumField label="Rib thickness" unit="mm" value={rib.thickness} min={1.2} max={8} step={0.1} onChange={(thickness) => patchRib({ thickness })} />
            <NumField label="Spar at" unit="chord" value={rib.sparX} min={0.15} max={0.55} step={0.01} onChange={(sparX) => patchRib({ sparX })} />
            <NumField label="Spar hole" unit="mm" value={rib.sparD} min={2} max={14} step={0.1} onChange={(sparD) => patchRib({ sparD })} />
            <NumField label="Wall left" unit="mm" value={rib.wall} min={1} max={3} step={0.1} onChange={(wall) => patchRib({ wall })} />
            <NumField label="Min trailing edge" unit="mm" value={rib.minTe} min={0.4} max={2.4} step={0.1} onChange={(minTe) => patchRib({ minTe })} />
            <button
              type="button"
              onClick={() => patchRib({ lights: !rib.lights })}
              className={`mt-3 min-h-11 w-full rounded-md border px-3 text-sm ${rib.lights ? "border-cyan text-cyan" : "border-line text-dust"}`}
            >
              Lightening holes {rib.lights ? "on" : "off"}
            </button>
          </>
        )}
        {part === "motor" && (
          <>
            <NumField label="Outer diameter" unit="mm" value={motor.od} min={20} max={80} step={0.5} onChange={(od) => patchMotor({ od })} />
            <NumField label="Thickness" unit="mm" value={motor.thickness} min={1.6} max={8} step={0.1} onChange={(thickness) => patchMotor({ thickness })} />
            <NumField label="Shaft bore" unit="mm" value={motor.bore} min={3} max={20} step={0.1} onChange={(bore) => patchMotor({ bore })} />
            <NumField label="Bolt circle" unit="mm" value={motor.boltCircle} min={10} max={50} step={0.5} onChange={(boltCircle) => patchMotor({ boltCircle })} />
            <NumField label="Bolt hole" unit="mm" value={motor.boltD} min={2} max={5} step={0.1} onChange={(boltD) => patchMotor({ boltD })} />
            <p className="mt-3 text-sm">Bolt count</p>
            <div className="mt-1">
              <Seg
                options={[
                  { id: "3", label: "3" },
                  { id: "4", label: "4" },
                  { id: "6", label: "6" },
                ]}
                value={String(motor.bolts)}
                onChange={(id) => patchMotor({ bolts: Number(id) })}
                columns="grid-cols-3"
              />
            </div>
          </>
        )}
        {part === "horn" && (
          <>
            <NumField label="Hub diameter" unit="mm" value={horn.hubD} min={8} max={18} step={0.5} onChange={(hubD) => patchHorn({ hubD })} />
            <NumField label="Arm length" unit="mm" value={horn.length} min={16} max={50} step={0.5} onChange={(length) => patchHorn({ length })} />
            <NumField label="Root width" unit="mm" value={horn.rootW} min={6} max={14} step={0.5} onChange={(rootW) => patchHorn({ rootW })} />
            <NumField label="Tip width" unit="mm" value={horn.tipW} min={3} max={8} step={0.1} onChange={(tipW) => patchHorn({ tipW })} />
            <NumField label="Thickness" unit="mm" value={horn.thickness} min={1.6} max={4} step={0.1} onChange={(thickness) => patchHorn({ thickness })} />
            <NumField label="Hub pilot" unit="mm" value={horn.hubHole} min={1.5} max={4} step={0.1} onChange={(hubHole) => patchHorn({ hubHole })} />
            <NumField label="Tip hole" unit="mm" value={horn.tipHole} min={1.2} max={3} step={0.1} onChange={(tipHole) => patchHorn({ tipHole })} />
          </>
        )}
        {part === "plate" && (
          <>
            <NumField label="Width" unit="mm" value={plate.width} min={24} max={160} step={1} onChange={(width) => patchPlate({ width })} />
            <NumField label="Height" unit="mm" value={plate.height} min={18} max={120} step={1} onChange={(height) => patchPlate({ height })} />
            <NumField label="Thickness" unit="mm" value={plate.thickness} min={1.6} max={8} step={0.1} onChange={(thickness) => patchPlate({ thickness })} />
            <NumField label="Corner hole" unit="mm" value={plate.holeD} min={2} max={5} step={0.1} onChange={(holeD) => patchPlate({ holeD })} />
            <NumField label="Hole inset" unit="mm" value={plate.inset} min={3} max={14} step={0.5} onChange={(inset) => patchPlate({ inset })} />
            <button
              type="button"
              onClick={() => patchPlate({ slot: !plate.slot })}
              className={`mt-3 min-h-11 w-full rounded-md border px-3 text-sm ${plate.slot ? "border-cyan text-cyan" : "border-line text-dust"}`}
            >
              Center slot {plate.slot ? "on" : "off"}
            </button>
            {plate.slot && (
              <>
                <NumField label="Slot length" unit="mm" value={plate.slotL} min={6} max={80} step={1} onChange={(slotL) => patchPlate({ slotL })} />
                <NumField label="Slot width" unit="mm" value={plate.slotW} min={2} max={12} step={0.5} onChange={(slotW) => patchPlate({ slotW })} />
              </>
            )}
          </>
        )}
        {part === "clip" && (
          <>
            <NumField label="Length" unit="mm" value={clip.length} min={8} max={40} step={1} onChange={(length) => patchClip({ length })} />
            <NumField label="Width" unit="mm" value={clip.width} min={8} max={24} step={0.5} onChange={(width) => patchClip({ width })} />
            <NumField label="Height" unit="mm" value={clip.height} min={6} max={16} step={0.5} onChange={(height) => patchClip({ height })} />
            <NumField label="Wall" unit="mm" value={clip.wall} min={1.2} max={3} step={0.1} onChange={(wall) => patchClip({ wall })} />
          </>
        )}
        <p className="mt-4 font-mono text-xs tracking-widest text-dust">FILAMENT</p>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {FILAMENTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilament(f.id)}
              className={`min-h-11 rounded-md border px-1 text-xs ${filament === f.id ? "border-cyan text-paper" : "border-line text-dust"}`}
            >
              <span className={`mx-auto mb-1 block size-3 rounded-full border border-line ${f.swatch}`} />
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <div className="order-1 flex min-w-0 flex-col gap-4 md:order-2">
        <section className="overflow-hidden rounded-md border border-line bg-hangar">
          <div className="h-72 md:h-stage">
            <Viewport positions={mesh.positions} indices={mesh.indices} color={color} />
          </div>
          <p className="border-t border-line px-4 py-2 font-mono text-xs text-dust">
            Drag to orbit · scroll to zoom · millimeters, lying flat on the bed
          </p>
        </section>
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Solid mass" value={`${grams.toFixed(1)} g`} />
          <Stat label="Volume" value={`${(volume / 1000).toFixed(2)} cm³`} />
          <Stat label="Envelope" value={`${size.x.toFixed(0)} × ${size.y.toFixed(0)} × ${size.z.toFixed(1)}`} />
          <Stat label="Triangles" value={String(tris)} />
        </section>
        <p className="text-xs text-dust">
          Solid PLA at 1.24 g/cm³. A 20% infill print is closer to half of that, and the slicer — not this view — owns the toolpath.
        </p>
        {mesh.warnings.length > 0 && (
          <ul className="grid gap-2">
            {mesh.warnings.map((w) => (
              <li key={w} className="rounded-md border border-line border-l-4 border-l-cyan bg-panel px-3 py-2 text-sm">
                {w}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={save}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-cyan px-4 text-sm font-medium text-ink"
        >
          <Download className="size-4" aria-hidden />
          Download STL
        </button>
        <ol className="grid gap-1 text-sm text-dust">
          <li>1. Download the STL. It is one part, in millimeters, already flat.</li>
          <li>2. Open it in the slicer that came with the printer: Bambu Studio, OrcaSlicer, PrusaSlicer, or Cura.</li>
          <li>3. Slice, then Send, Print, or save the G-code to the card. This bench cannot talk to the printer.</li>
        </ol>
      </div>
      {part === "rib" && (
        <div className="order-3 md:col-span-2">
          <Flight spanMm={spanMm} massG={massG} speedMs={speedMs} chord={rib.chord} setSpan={setSpan} setMass={setMass} setSpeed={setSpeed} />
        </div>
      )}
    </div>
  );
}

function Profile({ outer, holes }: { outer: [number, number][]; holes: [number, number][][] }) {
  if (outer.length < 3) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const pad = Math.max(w, h) * 0.12;
  const vb = `${minX - pad} ${-(maxY + pad)} ${w + pad * 2} ${h + pad * 2}`;
  const d = (ring: [number, number][]) =>
    ring.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)} ${(-p[1]).toFixed(2)}`).join(" ") + " Z";
  const sw = Math.max(w, h) * 0.012;
  return (
    <svg viewBox={vb} className="mt-3 h-28 w-full rounded-md bg-hangar">
      <path d={d(outer)} fill="var(--color-raised)" stroke="var(--color-cyan)" strokeWidth={sw} />
      {holes.map((hole, i) => (
        <path key={i} d={d(hole)} fill="var(--color-hangar)" stroke="var(--color-dust)" strokeWidth={sw * 0.7} />
      ))}
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-3">
      <p className="font-mono text-xs text-dust">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums text-paper">{value}</p>
    </div>
  );
}

function Flight({
  chord,
  spanMm,
  massG,
  speedMs,
  setSpan,
  setMass,
  setSpeed,
}: {
  chord: number;
  spanMm: number;
  massG: number;
  speedMs: number;
  setSpan: (n: number) => void;
  setMass: (n: number) => void;
  setSpeed: (n: number) => void;
}) {
  const c = chord / 1000;
  const b = spanMm / 1000;
  const area = c * b;
  const mass = massG / 1000;
  const load = area > 0 ? (mass * 9.80665) / area : 0;
  const kgm = area > 0 ? mass / area : 0;
  const oz = load / 2.992;
  const ar = c > 0 ? b / c : 0;
  const re = (speedMs * c) / 1.5e-5;
  return (
    <section className="rounded-md border border-line bg-panel p-4">
      <h2 className="text-base font-medium">Rectangular wing, from this rib</h2>
      <p className="mt-1 text-sm text-dust">
        Area is chord times span. No fuselage, no taper. Useful before the first foam cut, not a loads report.
      </p>
      <NumField label="Span" unit="mm" value={spanMm} min={200} max={2000} step={10} onChange={setSpan} />
      <NumField label="All-up mass" unit="g" value={massG} min={80} max={4000} step={10} onChange={setMass} />
      <NumField label="Cruise" unit="m/s" value={speedMs} min={4} max={40} step={0.5} onChange={setSpeed} />
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Area" value={`${(area * 10000).toFixed(0)} cm²`} />
        <Stat label="Aspect ratio" value={ar.toFixed(1)} />
        <Stat label="Wing loading" value={`${kgm.toFixed(1)} kg/m²`} />
        <Stat label="Also" value={`${oz.toFixed(1)} oz/ft²`} />
        <Stat label="Reynolds" value={formatRe(re)} />
        <Stat label="Dynamic pressure" value={`${(0.5 * 1.225 * speedMs * speedMs).toFixed(0)} Pa`} />
      </dl>
      <p className="mt-3 text-xs text-dust">
        Reynolds uses 1.5×10⁻⁵ m²/s, about 20 °C. At this chord a 2412 is a teaching airfoil, not the polar from a high-Re chart.
      </p>
    </section>
  );
}

function formatRe(re: number): string {
  if (!Number.isFinite(re)) return "—";
  if (re >= 1e6) return `${(re / 1e6).toFixed(2)}e6`;
  return `${Math.round(re / 1000)}k`;
}
