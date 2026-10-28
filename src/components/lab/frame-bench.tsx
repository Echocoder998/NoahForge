import { useEffect, useRef, useState } from "react";
import { chassisById } from "@/lib/robots/chassis";
import { useLab } from "@/lib/lab-store";
import { NumField, Seg } from "./fields";

const FILAMENT: Record<string, string> = {
  natural: "#e4d2ae",
  white: "#f4f1ea",
  orange: "#e25b1a",
  black: "#2c2c2a",
};

export function FrameBench() {
  const chassis = useLab((s) => s.chassis);
  const legs = useLab((s) => s.legs);
  const scale = useLab((s) => s.scale);
  const filament = useLab((s) => s.filament);
  const project = useLab((s) => s.projectName);
  const picked = useLab((s) => s.picked);
  const setScale = useLab((s) => s.setScale);
  const setLegs = useLab((s) => s.setLegs);
  const [testing, setTesting] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLParagraphElement>(null);
  const live = useRef({
    chassis,
    legs,
    color: FILAMENT[filament] ?? "#e4d2ae",
    scale,
    testing,
    project,
  });
  live.current = {
    chassis,
    legs,
    color: FILAMENT[filament] ?? "#e4d2ae",
    scale,
    testing,
    project,
  };

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const hud = hudRef.current;
    if (!host || !canvas || !hud) return;
    let dead = false;
    let stop = () => {};
    void import("./machine-view").then((mod) => {
      if (dead || !hostRef.current || !canvasRef.current || !hudRef.current) return;
      stop = mod.mountMachine(hostRef.current, canvasRef.current, live, hudRef.current);
    });
    return () => {
      dead = true;
      stop();
    };
  }, []);

  const spec = chassisById(chassis);
  const servos = (picked.sg90 ?? 0) + (picked.mg996 ?? 0);
  const flyer = chassis === "plane" || chassis === "drone" || chassis === "heli";

  const hold = (code: string, on: boolean) => {
    window.dispatchEvent(new CustomEvent("robot-bay-key", { detail: { code, on } }));
  };

  return (
    <div className="grid gap-4 md:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="order-2 min-w-0 rounded-md border border-line bg-panel p-4 md:order-1">
        <p className="font-mono text-xs tracking-widest text-dust">FRAME</p>
        <p className="mt-2 text-sm text-dust">{spec.blurb}</p>
        <p className="mt-2 text-sm text-dust">
          This bay is the assembled machine. Printable files are on Print — one STL at a time, then the slicer.
        </p>
        <NumField label="Size" unit="%" value={Math.round(scale * 100)} min={75} max={140} step={1} onChange={(n) => setScale(n / 100)} />
        {chassis === "spider" && (
          <>
            <p className="mt-3 text-sm">Legs</p>
            <div className="mt-1">
              <Seg
                options={[
                  { id: "6", label: "6" },
                  { id: "8", label: "8" },
                ]}
                value={String(legs)}
                onChange={(id) => setLegs(id === "8" ? 8 : 6)}
                columns="grid-cols-2"
              />
            </div>
            {servos !== legs && (
              <p className="mt-2 text-sm text-dust">
                The frame has {legs} legs. The wiring sheet has {servos} servos.
              </p>
            )}
          </>
        )}
        <p className="mt-3 text-sm">{spec.drive}</p>
        <p ref={hudRef} className="mt-3 font-mono text-xs text-amber">
          {project} · bay
        </p>
      </section>
      <section className="relative order-1 min-h-72 overflow-hidden rounded-md border border-line bg-hangar md:order-2 md:min-h-[32rem]">
        <div ref={hostRef} className="h-72 w-full md:h-[32rem]">
          <canvas ref={canvasRef} className="block h-full w-full" />
        </div>
        <button
          type="button"
          onClick={() => setTesting((v) => !v)}
          className={`absolute top-3 right-3 min-h-11 rounded-md px-4 text-sm font-medium ${testing ? "border border-line bg-hangar text-paper" : "bg-amber text-ink"}`}
        >
          {testing ? "Stop" : "Start"}
        </button>
        {testing && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-hangar/80 p-3 backdrop-blur-sm">
            <div className="grid grid-cols-3 gap-2">
              <span />
              <Pad label={chassis === "plane" ? "Nose up" : "Forward"} code="KeyW" hold={hold} />
              <span />
              <Pad label={chassis === "plane" ? "Bank L" : "Left"} code="KeyA" hold={hold} />
              <Pad label={chassis === "plane" ? "Nose dn" : "Back"} code="KeyS" hold={hold} />
              <Pad label={chassis === "plane" ? "Bank R" : "Right"} code="KeyD" hold={hold} />
            </div>
            {flyer && (
              <div className="grid grid-cols-2 gap-2">
                <Pad label={chassis === "plane" ? "Throttle" : "Climb"} code="Space" hold={hold} />
                <Pad label={chassis === "plane" ? "Idle" : "Descend"} code="KeyC" hold={hold} />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Pad({
  label,
  code,
  hold,
}: {
  label: string;
  code: string;
  hold: (code: string, on: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="min-h-11 rounded-md border border-line bg-panel text-sm text-paper"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        hold(code, true);
      }}
      onPointerUp={() => hold(code, false)}
      onPointerCancel={() => hold(code, false)}
      onLostPointerCapture={() => hold(code, false)}
    >
      {label}
    </button>
  );
}
