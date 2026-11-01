import { useEffect, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowRight, CheckCircle2, Download, Save, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab } from "@/lib/lab-store";
import {
  analyzeMechanical,
  assemblyBomCsv,
  assemblyScad,
  mountingAssemblyMesh,
  mountingPlateMesh,
  plateDxf,
} from "@/lib/engineering/mechanical";
import type { AssemblyConfig, NotebookEntry } from "@/lib/engineering/types";
import { localProjectDate } from "@/lib/engineering/types";
import { downloadBlob, meshToStl, slug } from "@/lib/aero/stl";
import { Viewport } from "@/components/lab/viewport";
import { SizingField, SizingMetric, sizingFormat as f } from "./sizing-fields";

export function MechanicalBench() {
  const config = useLab((state) => state.engineering.assembly);
  const patchEngineering = useLab((state) => state.patchEngineering);
  const patchPlate = useLab((state) => state.patchPlate);
  const setPart = useLab((state) => state.setPart);
  const setBench = useLab((state) => state.setBench);
  const projectName = useLab((state) => state.projectName);
  const [notice, setNotice] = useState("");
  const [color, setColor] = useState("maroon");
  const patch = (next: Partial<AssemblyConfig>) =>
    patchEngineering({ assembly: { ...config, ...next } });
  const result = analyzeMechanical(config);
  const mesh = useMemo(() => mountingAssemblyMesh(config), [config]);
  const insetX = (config.plateWidthMm - config.holePitchXmm) / 2;
  const insetY = (config.plateLengthMm - config.holePitchYmm) / 2;
  const transferable = result.valid && Math.abs(insetX - insetY) < 0.01;
  useEffect(() => {
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-cyan")
      .trim();
    if (accent) setColor(accent);
  }, []);
  const base = slug(projectName);
  const saveStl = (plateOnly: boolean) => {
    const solid = plateOnly ? mountingPlateMesh(config) : mesh;
    downloadBlob(
      `${base}-${plateOnly ? "mounting-plate" : "mounting-assembly"}.stl`,
      meshToStl(solid.positions, solid.indices, projectName),
      "model/stl",
    );
  };
  const record = () => {
    if (useLab.getState().engineering.notebook.length >= 100) {
      setNotice(
        "The notebook has 100 entries. Export its report and start a new project to record more.",
      );
      return;
    }
    const entry: NotebookEntry = {
      id: crypto.randomUUID(),
      date: localProjectDate(),
      title: "Mounting assembly revision",
      kind: "revision",
      procedure:
        "Analytical geometry and solid-volume estimate; check tolerances with a physical coupon and test the assembled loads.",
      predicted: result.massG,
      measured: null,
      unit: "g",
      notes: `${config.plateWidthMm} × ${config.plateLengthMm} × ${config.plateThicknessMm} mm plate; ${config.mountHeightMm} mm posts; ${config.holeDiameterMm} mm holes on ${config.holePitchXmm} × ${config.holePitchYmm} mm pitch. ${config.material}, density ${config.densityGcm3} g/cm³, ${config.orientation} orientation. ${result.checks.map((check) => `${check.title}: ${check.detail}`).join(" ")}`,
      photos: [],
    };
    patchEngineering({ notebook: [...useLab.getState().engineering.notebook, entry] });
    setNotice("Assembly revision saved to the experiment notebook.");
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-lg border border-line bg-panel p-4 text-sm">
        <p className="font-medium">Parametric mounting assembly</p>
        <p className="mt-1 text-dust">
          One base plate, four integral mounting columns, and continuous fastener holes. Dimensions
          update the real mesh and CAD exports. Use the existing Printable parts workspace for ribs,
          motor mounts, horns, plates and clips.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SizingMetric
          label="Plate footprint"
          value={`${f(config.plateWidthMm, 0)} × ${f(config.plateLengthMm, 0)}`}
          unit="mm"
        />
        <SizingMetric
          label="Overall height"
          value={f(config.plateThicknessMm + config.mountHeightMm)}
          unit="mm"
        />
        <SizingMetric
          label="Solid material estimate"
          value={f(result.massG)}
          unit="g"
          help="Full-density volume; actual print infill differs"
        />
        <SizingMetric
          label="Mounting pattern"
          value={`${f(config.holePitchXmm)} × ${f(config.holePitchYmm)}`}
          unit="mm"
        />
      </div>
      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <section
          className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel xl:col-span-2"
          aria-label="Mechanical assembly preview"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
            <h2 className="text-base font-semibold">Mounting assembly · millimeters</h2>
            <span className="text-xs text-dust">Drag to orbit · scroll to zoom</span>
          </div>
          <div className="h-96 bg-hangar lg:h-128">
            {result.valid ? (
              <Viewport positions={mesh.positions} indices={mesh.indices} color={color} />
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center text-sm text-dust">
                Fix the geometry checks to display and export the assembly.
              </div>
            )}
          </div>
          <div className="border-t border-line p-4 text-xs text-dust">
            The preview is geometric. It does not simulate stress, fatigue, layer adhesion, screw
            preload or vibration.
          </div>
        </section>
        <Tabs.Root
          defaultValue="dimensions"
          className="min-w-0 rounded-xl border border-line bg-panel"
        >
          <Tabs.List
            aria-label="Mechanical design sections"
            className="grid grid-cols-2 gap-1 border-b border-line p-1"
          >
            <Tabs.Trigger
              value="dimensions"
              className="min-h-11 rounded-md px-2 text-sm text-dust data-[state=active]:bg-raised data-[state=active]:text-cyan"
            >
              Dimensions
            </Tabs.Trigger>
            <Tabs.Trigger
              value="material"
              className="min-h-11 rounded-md px-2 text-sm text-dust data-[state=active]:bg-raised data-[state=active]:text-cyan"
            >
              Material & fit
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="dimensions" className="grid grid-cols-2 gap-3 p-4">
            <SizingField
              label="Plate width"
              value={config.plateWidthMm}
              unit="mm"
              min={10}
              max={500}
              onChange={(plateWidthMm) => patch({ plateWidthMm })}
            />
            <SizingField
              label="Plate length"
              value={config.plateLengthMm}
              unit="mm"
              min={10}
              max={600}
              onChange={(plateLengthMm) => patch({ plateLengthMm })}
            />
            <SizingField
              label="Plate thickness"
              value={config.plateThicknessMm}
              unit="mm"
              min={0.5}
              max={30}
              step={0.1}
              onChange={(plateThicknessMm) => patch({ plateThicknessMm })}
            />
            <SizingField
              label="Mounting column height"
              value={config.mountHeightMm}
              unit="mm"
              min={0}
              max={150}
              step={0.5}
              onChange={(mountHeightMm) => patch({ mountHeightMm })}
            />
            <SizingField
              label="Hole pitch X"
              value={config.holePitchXmm}
              unit="mm"
              min={1}
              max={480}
              onChange={(holePitchXmm) => patch({ holePitchXmm })}
            />
            <SizingField
              label="Hole pitch Y"
              value={config.holePitchYmm}
              unit="mm"
              min={1}
              max={580}
              onChange={(holePitchYmm) => patch({ holePitchYmm })}
            />
            <SizingField
              label="Hole diameter"
              value={config.holeDiameterMm}
              unit="mm"
              min={1}
              max={20}
              step={0.1}
              onChange={(holeDiameterMm) => patch({ holeDiameterMm })}
            />
            <div className="flex flex-col justify-center text-xs text-dust">
              <span>Column outside diameter</span>
              <span className="mt-1 font-mono text-sm text-paper">
                {f(result.postOuterDiameterMm)} mm
              </span>
              <span className="mt-1">At least 2 mm radial wall around the hole.</span>
            </div>
          </Tabs.Content>
          <Tabs.Content value="material" className="space-y-4 p-4">
            <label className="block">
              <span className="mb-1 block text-xs text-dust">Material</span>
              <select
                aria-label="Assembly material"
                value={config.material}
                onChange={(event) =>
                  patch({ material: event.target.value as AssemblyConfig["material"] })
                }
                className="min-h-11 w-full rounded-md border border-line bg-hangar px-3 text-sm"
              >
                {["PLA", "PETG", "ABS", "Aluminum"].map((material) => (
                  <option key={material}>{material}</option>
                ))}
              </select>
            </label>
            <SizingField
              label="Material density assumption"
              value={config.densityGcm3}
              unit="g/cm³"
              min={0.1}
              max={20}
              step={0.01}
              onChange={(densityGcm3) => patch({ densityGcm3 })}
            />
            <p className="text-xs text-dust">
              Density is independent of the material label. Enter the actual grade's datasheet
              value; this estimate assumes a fully solid part.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs text-dust">Planned build orientation</span>
              <select
                aria-label="Planned build orientation"
                value={config.orientation}
                onChange={(event) =>
                  patch({ orientation: event.target.value as AssemblyConfig["orientation"] })
                }
                className="min-h-11 w-full rounded-md border border-line bg-hangar px-3 text-sm"
              >
                <option value="flat">Flat</option>
                <option value="edge">On edge</option>
                <option value="upright">Upright</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-dust">Fastener size</span>
              <select
                aria-label="Assembly fastener size"
                value={config.fastenerSize}
                onChange={(event) =>
                  patch({ fastenerSize: event.target.value as AssemblyConfig["fastenerSize"] })
                }
                className="min-h-11 w-full rounded-md border border-line bg-hangar px-3 text-sm"
              >
                {["M2", "M3", "M4"].map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </label>
            <SizingField
              label="Added diametral clearance"
              value={config.clearanceMm}
              unit="mm"
              min={0}
              max={2}
              step={0.05}
              onChange={(clearanceMm) => patch({ clearanceMm })}
            />
            <p className="text-xs text-dust">
              Hole diameter must cover nominal screw diameter plus this allowance. Orientation and
              material are manufacturing notes; no strength model is assumed.
            </p>
          </Tabs.Content>
        </Tabs.Root>
      </div>
      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="text-base font-semibold">Geometry and manufacturing review</h2>
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {result.checks.map((check) => (
            <li key={check.title} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">
                {check.level === "pass" ? (
                  <CheckCircle2 className="size-4 text-mint" aria-hidden />
                ) : (
                  <TriangleAlert
                    className={`size-4 ${check.level === "fail" ? "text-magenta" : "text-cyan"}`}
                    aria-hidden
                  />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{check.title}</p>
                <p className="mt-1 text-xs text-dust">{check.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="text-base font-semibold">Make and exchange files</h2>
        <p className="mt-1 text-sm text-dust">
          STL files use millimeters. OpenSCAD keeps the dimensions editable; DXF contains the plate
          outline and four hole centers. Inspect manufacturing settings in your CAD tool and slicer.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" disabled={!result.valid} onClick={() => saveStl(false)}>
            <Download className="size-4" aria-hidden />
            Assembly STL
          </Button>
          <Button disabled={!result.valid} onClick={() => saveStl(true)}>
            <Download className="size-4" aria-hidden />
            Plate STL
          </Button>
          <Button
            disabled={!result.valid}
            onClick={() =>
              downloadBlob(
                `${base}-mounting-assembly.scad`,
                assemblyScad(config, projectName),
                "text/plain",
              )
            }
          >
            <Download className="size-4" aria-hidden />
            Editable CAD source
          </Button>
          <Button
            disabled={!result.valid}
            onClick={() =>
              downloadBlob(`${base}-plate-profile.dxf`, plateDxf(config), "application/dxf")
            }
          >
            <Download className="size-4" aria-hidden />
            Plate DXF
          </Button>
          <Button
            disabled={!result.valid}
            onClick={() =>
              downloadBlob(`${base}-mounting-hardware.csv`, assemblyBomCsv(config), "text/csv")
            }
          >
            <Download className="size-4" aria-hidden />
            Hardware BOM
          </Button>
        </div>
        <div className="mt-4 rounded-lg border border-line bg-hangar p-3 text-sm">
          <p>
            Hardware starting point: 4 × {config.fastenerSize} screws, approximately{" "}
            {result.screwLengthMm} mm long; 4 nuts and 8 washers.
          </p>
          <p className="mt-1 text-xs text-dust">
            Length includes an assumed 4 mm nut/washer stack. Confirm the mating part, thread
            engagement, actual stack and bearing loads.
          </p>
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!transferable}
          onClick={() => {
            patchPlate({
              width: config.plateWidthMm,
              height: config.plateLengthMm,
              thickness: config.plateThicknessMm,
              holeD: config.holeDiameterMm,
              inset: insetX,
              slot: false,
            });
            setPart("plate");
            setBench("print");
          }}
        >
          <ArrowRight className="size-4" aria-hidden />
          Apply plate to Printable parts
        </Button>
        <Button onClick={record} disabled={!result.valid}>
          <Save className="size-4" aria-hidden />
          Save assembly revision
        </Button>
      </div>
      {!transferable && result.valid && (
        <p className="text-xs text-dust">
          The existing plate editor uses one shared edge inset. Set equal X/Y edge distances to
          transfer the exact hole pattern; the CAD and STL exports support unequal pitches.
        </p>
      )}
      <p role="status" className="text-sm text-cyan">
        {notice}
      </p>
    </div>
  );
}
