import { useEffect } from "react";
import { Bug, Fan, PersonStanding, Plane, Radar } from "lucide-react";
import { useLab, type Bench } from "@/lib/lab-store";
import { CHASSIS, type ChassisId } from "@/lib/robots/chassis";
import { CodeBench } from "./code-bench";
import { FrameBench } from "./frame-bench";
import { PrintBench } from "./print-bench";
import { WireBench } from "./wire-bench";

const BENCHES: { id: Bench; label: string }[] = [
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

  useEffect(() => {
    void useLab.persist.rehydrate();
  }, []);

  return (
    <div className="min-h-dvh bg-hangar text-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-md bg-amber font-mono text-sm font-medium text-ink">
              NF
            </span>
            <div>
              <p className="font-mono text-xs tracking-widest text-amber">PRINT · WIRE · FLASH</p>
              <h1 className="text-xl font-medium tracking-tight">Noah Forge</h1>
              <a
                href="/noah-forge-source.zip"
                download="noah-forge-source.zip"
                className="mt-1 inline-flex min-h-11 items-center text-sm text-amber underline underline-offset-2"
              >
                Download source
              </a>
            </div>
          </div>
          <nav className="grid grid-cols-4 gap-1 rounded-md bg-panel p-1" aria-label="Benches">
            {BENCHES.map((item) => {
              const on = item.id === bench;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setBench(item.id)}
                  className={`min-h-11 rounded-md px-2 text-sm ${on ? "bg-paper text-ink" : "text-dust"}`}
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
            <span className="font-mono text-xs tracking-widest text-dust">PROJECT</span>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="mt-1 w-full border-b border-line bg-transparent py-2 text-lg outline-none"
              maxLength={48}
            />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Chassis">
            {CHASSIS.map((item) => {
              const on = item.id === chassis;
              const Icon = ICONS[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setChassis(item.id)}
                  className={`inline-flex min-h-11 min-w-28 flex-1 items-center justify-center gap-2 rounded-md border px-3 text-sm ${on ? "border-amber bg-raised text-paper" : "border-line text-dust"}`}
                >
                  <Icon className="size-4" aria-hidden />
                  {item.name}
                </button>
              );
            })}
          </div>
        </div>
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
