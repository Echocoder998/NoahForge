import { useEffect } from "react";
import { Bug, Fan, PersonStanding, Plane, Radar, Sparkles } from "lucide-react";
import { useLab, type Bench } from "@/lib/lab-store";
import { CHASSIS, type ChassisId } from "@/lib/robots/chassis";
import { CodeBench } from "./code-bench";
import { DesignBench } from "./design-bench";
import { FrameBench } from "./frame-bench";
import { PrintBench } from "./print-bench";
import { WireBench } from "./wire-bench";

const BENCHES: { id: Bench; label: string }[] = [
  { id: "design", label: "Design" },
  { id: "frame", label: "Frame" },
  { id: "print", label: "Print" },
  { id: "wire", label: "Wire" },
  { id: "code", label: "Code" },
];

const ICONS: Record<ChassisId, typeof Plane> = {
  plane: Plane,
  drone: Radar,
  heli: Fan,
  spider: Bug,
  humanoid: PersonStanding,
};

export function Lab() {
  const bench = useLab((s) => s.bench);
  const chassis = useLab((s) => s.chassis);
  const projectName = useLab((s) => s.projectName);
  const setBench = useLab((s) => s.setBench);
  const setProjectName = useLab((s) => s.setProjectName);
  const setChassis = useLab((s) => s.setChassis);
  const customs = useLab((s) => s.customs);
  const customId = useLab((s) => s.customId);
  const activateDesign = useLab((s) => s.activateDesign);

  useEffect(() => {
    void useLab.persist.rehydrate();
  }, []);

  return (
    <div className="min-h-dvh text-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-ink/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo-mark.png"
              alt=""
              width={44}
              height={44}
              className="size-11 rounded-md drop-shadow-[0_0_10px_rgb(38_231_255/0.45)]"
            />
            <div>
              <h1 className="font-display text-xl font-semibold leading-none">Noah Forge</h1>
              <p className="mt-1.5 text-[0.68rem] font-bold tracking-[0.32em] text-cyan text-glow">PRINT · WIRE · FLASH</p>
            </div>
          </div>
          <nav className="grid grid-cols-5 gap-1 rounded-md border border-line bg-panel p-1" aria-label="Benches">
            {BENCHES.map((item) => {
              const on = item.id === bench;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setBench(item.id)}
                  className={`min-h-11 rounded-md px-2 text-sm font-semibold transition-colors ${on ? "bg-raised text-cyan text-glow" : "text-dust hover:text-paper"}`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-4 flex flex-col gap-3">
          <label className="block min-w-0">
            <span className="text-xs font-bold tracking-[0.18em] text-mint">PROJECT</span>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="mt-1 w-full border-b border-line bg-transparent py-2 text-lg outline-none"
              maxLength={48}
            />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Chassis">
            {CHASSIS.map((item) => {
              const on = !customId && item.id === chassis;
              const Icon = ICONS[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setChassis(item.id)}
                  className={`inline-flex min-h-11 min-w-28 flex-1 items-center justify-center gap-2 rounded-md border px-3 text-sm ${on ? "border-cyan bg-raised text-paper" : "border-line text-dust"}`}
                >
                  <Icon className="size-4" aria-hidden />
                  {item.name}
                </button>
              );
            })}
            {customs.map((d) => {
              const on = d.id === customId;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => activateDesign(d.id)}
                  className={`inline-flex min-h-11 min-w-28 flex-1 items-center justify-center gap-2 rounded-md border px-3 text-sm ${on ? "border-cyan bg-raised text-paper" : "border-line text-dust"}`}
                >
                  <Sparkles className="size-4 text-mint" aria-hidden />
                  <span className="max-w-40 truncate">{d.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        {bench === "design" && <DesignBench />}
        {bench === "frame" && <FrameBench />}
        {bench === "print" && <PrintBench />}
        {bench === "wire" && <WireBench />}
        {bench === "code" && <CodeBench />}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-dust">
        A student bench, not a certified aircraft and not a walker you should trust near people. The bay is a model. Props stay off until the wiring faults are gone and you have read the sketch.
      </footer>
    </div>
  );
}
