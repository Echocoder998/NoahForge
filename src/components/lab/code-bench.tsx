import { useState } from "react";
import { Copy, Download } from "lucide-react";
import { makeSketch, SKETCHES, type SketchId } from "@/lib/code/sketches";
import { downloadBlob, slug } from "@/lib/aero/stl";
import { useActiveDesign, useBenchPlan, useLab } from "@/lib/lab-store";
import { designSketches } from "@/lib/robots/design";
import { chassisById, sketchesFor } from "@/lib/robots/chassis";
import { Seg } from "./fields";

export function CodeBench() {
  const projectName = useLab((s) => s.projectName);
  const sketch = useLab((s) => s.sketch);
  const notes = useLab((s) => s.notes);
  const setSketch = useLab((s) => s.setSketch);
  const setNotes = useLab((s) => s.setNotes);
  const [copied, setCopied] = useState(false);
  const chassis = useLab((s) => s.chassis);
  const design = useActiveDesign();
  const plan = useBenchPlan();
  const file = makeSketch(sketch, projectName, plan, design ? design.name : chassisById(chassis).name);
  const offered = design ? designSketches(design) : sketchesFor(chassis);
  const choices = SKETCHES.filter((s) => offered.includes(s.id));
  const faults = plan.issues.filter((i) => i.level === "fault").length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const save = () => {
    downloadBlob(file.filename, file.code, "text/x-arduino");
  };

  return (
    <div className="grid gap-4 md:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="min-w-0 rounded-md border border-line bg-panel p-4">
        <p className="font-mono text-xs tracking-widest text-dust">SKETCH</p>
        <div className="mt-2">
          <Seg
            options={choices.map((s) => ({ id: s.id, label: s.name }))}
            value={sketch}
            onChange={(id) => setSketch(id as SketchId)}
            columns="grid-cols-1"
          />
        </div>
        <p className="mt-3 text-sm text-dust">{SKETCHES.find((s) => s.id === sketch)?.blurb}</p>
        <p className="mt-3 text-sm">
          {faults > 0
            ? "The wiring bench still has faults. The file says so at the top. Do not arm anything."
            : "Pins in this file are the same ones on the wiring bench."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm"
          >
            <Copy className="size-4" aria-hidden />
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={save}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-cyan px-3 text-sm font-medium text-ink"
          >
            <Download className="size-4" aria-hidden />
            {file.filename}
          </button>
        </div>
        <label className="mt-6 block">
          <span className="font-mono text-xs tracking-widest text-dust">BENCH NOTES</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            placeholder="What you changed, which way the horn moved, what to fix before the next print."
            className="mt-2 w-full resize-y rounded-md border border-line bg-hangar px-3 py-3 text-sm outline-none"
          />
        </label>
        <p className="mt-2 text-xs text-dust">Notes stay in this browser.</p>
      </section>
      <section className="min-w-0 overflow-hidden rounded-md border border-line bg-hangar">
        <pre className="max-h-stage overflow-auto p-4 font-mono text-xs leading-relaxed text-paper">
          {file.code}
        </pre>
      </section>
    </div>
  );
}
