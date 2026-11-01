import { useEffect, useMemo, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  CheckCircle2,
  Download,
  NotebookPen,
  Pause,
  Play,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumField } from "@/components/lab/fields";
import { downloadBlob, slug } from "@/lib/aero/stl";
import {
  gaitCsv,
  gaitCycle,
  gaitFrame,
  solveLeg,
  staticLoads,
  type GaitFrame,
  type LegSolution,
} from "@/lib/engineering/leg";
import type { LegConfig } from "@/lib/engineering/types";
import { localProjectDate } from "@/lib/engineering/types";
import { useLab } from "@/lib/lab-store";

const number = (n: number, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : "—");
const wrap = (n: number) => ((n % 1) + 1) % 1;

export function LegBench() {
  const engineering = useLab((s) => s.engineering);
  const patchEngineering = useLab((s) => s.patchEngineering);
  const projectName = useLab((s) => s.projectName);
  const config = engineering.leg;
  const patch = (values: Partial<LegConfig>) =>
    patchEngineering({ leg: { ...useLab.getState().engineering.leg, ...values } });
  const [tab, setTab] = useState("geometry");
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState(config.phase);
  const [selectedFoot, setSelectedFoot] = useState(0);
  const [notice, setNotice] = useState("");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    setPlaying(false);
    setPhase(config.phase);
  }, [config.phase]);
  useEffect(() => {
    setSelectedFoot((index) => Math.min(index, config.legCount - 1));
  }, [config.legCount]);
  useEffect(() => {
    if (!playing) return;
    let frameId = 0;
    let previous = 0;
    const update = (time: number) => {
      const dt = previous ? Math.min((time - previous) / 1000, 0.1) : 0;
      previous = time;
      setPhase((value) => wrap(value + dt / Math.max(0.25, config.cycleSeconds)));
      frameId = requestAnimationFrame(update);
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [playing, config.cycleSeconds]);

  const frame = useMemo(() => gaitFrame(config, phase), [config, phase]);
  const cycle = useMemo(() => gaitCycle(config), [config]);
  const manual = useMemo(() => solveLeg(config), [config]);
  const selected = frame.feet[Math.min(selectedFoot, frame.feet.length - 1)]!;
  const solution = tab === "gait" ? selected.solution : manual;
  const loads = staticLoads(config, frame.groundedCount, solution);
  const status = solution.withinLimits
    ? "Target within reach and joint limits"
    : solution.reachable
      ? "Reachable, but outside joint limits"
      : "Target is not reachable";
  const togglePlayback = () => {
    if (playing) patch({ phase: phaseRef.current });
    setPlaying((value) => !value);
  };
  const record = () => {
    if (useLab.getState().engineering.notebook.length >= 100) {
      setNotice(
        "The notebook has 100 entries. Export its report and start a new project to record more.",
      );
      return;
    }
    const entry = {
      id: `leg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      date: localProjectDate(),
      title: `${config.legCount}-leg ${config.gait} analysis`,
      kind: "experiment" as const,
      procedure: `Analytical prediction only. ${config.joints}-joint leg: coxa ${config.joints === 3 ? config.coxaMm : 0} mm, upper ${config.upperMm} mm, lower ${config.lowerMm} mm. Target (${number(solution.target.x)}, ${number(solution.target.y)}, ${number(solution.target.z)}) mm. Record a bench measurement of required hip torque under the same pose and loading.`,
      predicted: loads?.requiredHipNm ?? null,
      measured: null,
      unit: "N·m",
      notes: `${status}. Phase ${number(phase * 100)}%; ${frame.groundedCount} supporting feet; static margin ${frame.marginMm === null ? "undefined" : number(frame.marginMm) + " mm"}. Body ${config.bodyMassG} g; payload ${config.payloadG} g; each link ${config.linkMassG} g; service factor ${config.serviceFactor}. Servo rating ${config.servoTorqueNm} N·m at ${config.servoVoltageV} V; source: ${config.servoSource || "not supplied"}. Equal load sharing, stationary level ground, and absolute gravitational moments assumed. No impact, dynamics, friction or actuator thermal model.`,
      photos: [],
    };
    patchEngineering({ notebook: [entry, ...useLab.getState().engineering.notebook] });
    setNotice(
      "Analysis recorded in the experiment notebook. Add measured results after the bench test.",
    );
  };

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-3">
      <div className="min-w-0 space-y-4 xl:col-span-2">
        <section
          className="overflow-hidden rounded-xl border border-line bg-panel"
          aria-labelledby="leg-geometry-heading"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4">
            <div>
              <h2 id="leg-geometry-heading" className="text-base font-semibold">
                Leg geometry
              </h2>
              <p className="mt-1 text-xs text-dust">
                {tab === "gait"
                  ? `${selected.id} at the current gait phase`
                  : "Editable foot target"}{" "}
                · radial side view · millimeters
              </p>
            </div>
            <span
              className={`flex items-center gap-2 text-xs ${solution.withinLimits ? "text-mint" : "text-magenta"}`}
            >
              {solution.withinLimits ? (
                <CheckCircle2 className="size-4" aria-hidden />
              ) : (
                <TriangleAlert className="size-4" aria-hidden />
              )}
              {solution.withinLimits ? "Within limits" : "Review target"}
            </span>
          </div>
          <DiagramCanvas
            label="Leg reach and joint geometry. The solid links show the solved pose; a cross marks the requested foot target."
            draw={(ctx, width, height, theme) =>
              drawLeg(ctx, width, height, theme, config, solution)
            }
          />
          <div className="grid grid-cols-3 border-t border-line">
            <Stat label="Hip pitch" value={`${number(solution.hipDeg)}°`} />
            <Stat label="Knee flexion" value={`${number(solution.kneeDeg)}°`} />
            <Stat
              label={config.joints === 3 ? "Hip yaw" : "Planar yaw"}
              value={`${number(solution.yawDeg)}°`}
            />
          </div>
          <div className="border-t border-line px-4 py-3">
            <p className="text-sm font-medium">{status}</p>
            <p className="mt-1 text-xs text-dust">
              Pitch-link reach: {number(solution.minReachMm, 0)}–{number(solution.maxReachMm, 0)} mm
              from the pitch joint. The faint ring is geometric reach; joint limits further restrict
              it.
            </p>
            {solution.issues.map((issue) => (
              <p key={issue} className="mt-2 text-xs text-magenta">
                {issue}
              </p>
            ))}
          </div>
        </section>

        <section
          className="overflow-hidden rounded-xl border border-line bg-panel"
          aria-labelledby="gait-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
            <div>
              <h2 id="gait-heading" className="text-base font-semibold">
                Contact pattern & balance
              </h2>
              <p className="mt-1 text-xs text-dust">
                Top view · X is fore/aft; Y is left/right · filled feet touch the ground
              </p>
            </div>
            <Button
              onClick={togglePlayback}
              variant={playing ? "secondary" : "primary"}
              aria-label={playing ? "Pause gait preview" : "Play gait preview"}
            >
              {playing ? (
                <Pause className="size-4" aria-hidden />
              ) : (
                <Play className="size-4" aria-hidden />
              )}
              {playing ? "Pause" : "Play gait"}
            </Button>
          </div>
          <DiagramCanvas
            label="Top-down robot contact pattern, static support polygon, and projected center of mass."
            draw={(ctx, width, height, theme) =>
              drawContacts(ctx, width, height, theme, config, frame)
            }
          />
          <div className="px-4 pb-4">
            <label
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
              htmlFor="gait-phase"
            >
              <span>Cycle phase</span>
              <output className="font-mono text-xs text-cyan">{number(phase * 100, 0)}%</output>
            </label>
            <input
              id="gait-phase"
              aria-label="Gait cycle phase"
              type="range"
              min={0}
              max={0.999}
              step={0.001}
              value={phase}
              onChange={(event) => {
                const next = Number(event.target.value);
                setPlaying(false);
                setPhase(next);
                patch({ phase: next });
              }}
              className="mt-1 w-full"
            />
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Inspect a leg">
              {frame.feet.map((foot) => (
                <button
                  key={foot.id}
                  type="button"
                  onClick={() => {
                    setSelectedFoot(foot.index);
                    setTab("gait");
                  }}
                  aria-pressed={selectedFoot === foot.index}
                  className={`min-h-11 rounded-md border px-3 text-xs ${selectedFoot === foot.index ? "border-cyan bg-raised text-cyan" : "border-line text-paper"}`}
                >
                  {foot.id} · {foot.grounded ? "stance" : "swing"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 border-t border-line">
            <Stat label="Ground contacts" value={`${frame.groundedCount}/${config.legCount}`} />
            <Stat
              label="Static margin"
              value={frame.marginMm === null ? "Undefined" : `${number(frame.marginMm)} mm`}
            />
            <Stat label="Cycle min. contacts" value={String(cycle.minimumContacts)} />
          </div>
          <div className="border-t border-line p-4">
            <p className="text-sm font-medium">
              {frame.stable
                ? "Center of mass is inside the static support polygon"
                : "Static balance needs review at this phase"}
            </p>
            {frame.issues.map((issue) => (
              <p key={issue} className="mt-2 text-xs text-magenta">
                {issue}
              </p>
            ))}
            <p className="mt-2 text-xs text-dust">
              Across 100 sampled phases: {cycle.supportedPhases}/100 have a positive static margin;{" "}
              {cycle.infeasiblePhases}/100 include a leg target outside reach or limits.{" "}
              {cycle.minimumMarginMm === null
                ? "Some phases have no support polygon."
                : `Minimum sampled margin: ${number(cycle.minimumMarginMm)} mm.`}
            </p>
            <p className="mt-2 text-xs text-dust">
              Prescribed foot motion and flat-ground contact timing are shown. Positive static
              margin does not establish dynamic stability, traction, or hardware performance. In
              two-joint mode, each leg moves in a fixed plane; mounting orientation must be checked
              in the real assembly.
            </p>
          </div>
        </section>

        <section
          className="rounded-xl border border-line bg-panel p-4"
          aria-labelledby="leg-loads-summary"
        >
          <h2 id="leg-loads-summary" className="text-base font-semibold">
            Static joint load estimate
          </h2>
          {loads ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Load per stance leg" value={`${number(loads.forcePerLegN, 2)} N`} />
                <Metric label="Hip × factor" value={`${number(loads.requiredHipNm, 3)} N·m`} />
                <Metric label="Knee × factor" value={`${number(loads.requiredKneeNm, 3)} N·m`} />
                <Metric
                  label="Listed rating / demand"
                  value={
                    loads.ratingRatio === null ? "No load" : `${number(loads.ratingRatio, 2)}×`
                  }
                />
              </div>
              <p
                className={`mt-3 text-sm font-medium ${loads.ratingExceedsEstimate ? "text-paper" : "text-magenta"}`}
              >
                {loads.ratingExceedsEstimate
                  ? "Entered torque rating exceeds this static sizing estimate."
                  : "Entered torque rating is below this static sizing estimate."}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-magenta">
              A valid pose, at least one supporting foot, non-negative masses, and a service factor
              of at least 1 are needed to calculate loads.
            </p>
          )}
          <p className="mt-2 text-xs text-dust">
            A stall torque is not a continuous operating rating. Verify the manufacturer’s voltage,
            speed, current, duty cycle, and thermal limits.{" "}
            {config.servoSource.trim()
              ? "The reference below is supplied by you and has not been independently verified."
              : "No servo datasheet or measurement source has been recorded yet."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={record}>
              <NotebookPen className="size-4" aria-hidden />
              Record analysis
            </Button>
            <Button
              onClick={() =>
                downloadBlob(`${slug(projectName)}-gait.csv`, gaitCsv(config), "text/csv")
              }
            >
              <Download className="size-4" aria-hidden />
              Export gait CSV
            </Button>
          </div>
          <p role="status" className="mt-2 text-xs text-dust">
            {notice}
          </p>
          <details className="mt-4 border-t border-line pt-3">
            <summary className="min-h-11 cursor-pointer text-sm font-medium">
              Equations, coordinates & assumptions
            </summary>
            <div className="space-y-2 text-xs leading-relaxed text-dust">
              <p>
                Local x points outward from the hip, y is lateral to the leg plane, and z points up.
                Three-joint mode adds yaw and a coxa offset; two-joint mode sets yaw and coxa to
                zero. The selected knee-up solution uses positive knee flexion.
              </p>
              <p className="font-mono">
                r = √(x² + y²) − coxa; d² = r² + z²
                <br />
                knee = acos((d² − upper² − lower²) / (2 × upper × lower))
                <br />
                hip = atan2(z, r) + atan2(lower × sin(knee), upper + lower × cos(knee))
              </p>
              <p>
                For two-joint mode, r = x and target y must be zero. A target is geometrically
                reachable when |upper − lower| ≤ d ≤ upper + lower, then each joint’s travel limits
                are checked.
              </p>
              <p className="font-mono">
                F per stance leg = (body + payload) × 9.80665 / stance legs
                <br />
                Joint torque ≈ Σ |force × horizontal lever arm|
                <br />
                Sizing demand = static torque × service factor
              </p>
              <p>
                Masses are converted from grams to kilograms and lever arms from millimeters to
                meters. Body mass excludes payload and the two links of every leg. Both pitch links
                use the entered mass per link. Their gravitational moments are added conservatively.
                The model assumes equal body-load sharing, a rigid structure, vertical gravity,
                level stationary ground, and no slipping. It excludes acceleration, impacts,
                friction, drivetrain losses, and thermal effects. Yaw-axis drive torque is not
                estimated.
              </p>
              <p>
                Static margin is the smallest signed perpendicular distance from projected center of
                mass to a support-polygon edge. A positive value is inside; zero is an edge; fewer
                than three non-collinear contacts produce no polygon. The displayed contact pattern
                uses prescribed body-frame footprints and stride timing, not a solved whole-body
                walking controller.
              </p>
            </div>
          </details>
        </section>
      </div>

      <section
        className="min-w-0 self-start overflow-hidden rounded-xl border border-line bg-panel"
        aria-label="Leg design controls"
      >
        <Tabs.Root value={tab} onValueChange={setTab}>
          <Tabs.List
            className="grid grid-cols-3 border-b border-line p-1"
            aria-label="Leg workbench settings"
          >
            {[
              ["geometry", "Geometry"],
              ["gait", "Gait"],
              ["loads", "Loads"],
            ].map(([value, label]) => (
              <Tabs.Trigger
                key={value}
                value={value!}
                className="min-h-11 rounded-md px-2 text-sm text-dust data-[state=active]:bg-raised data-[state=active]:text-paper"
              >
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="geometry" className="p-4">
            <h2 className="text-sm font-semibold">Links & foot target</h2>
            <p className="mt-1 text-xs text-dust">
              Change geometry to inspect a local leg pose. Joint angles are solved analytically.
            </p>
            <Select
              label="Joint model"
              value={String(config.joints)}
              onChange={(value) =>
                patch({
                  joints: Number(value) as 2 | 3,
                  ...(value === "2" ? { targetYmm: 0 } : {}),
                })
              }
              options={[
                ["2", "2 joints · planar"],
                ["3", "3 joints · yaw + pitch"],
              ]}
            />
            {config.joints === 3 && (
              <NumberControl
                label="Coxa offset"
                unit="mm"
                value={config.coxaMm}
                min={0}
                max={100}
                step={1}
                onChange={(value) => patch({ coxaMm: value })}
              />
            )}
            <NumberControl
              label="Upper link"
              unit="mm"
              value={config.upperMm}
              min={10}
              max={250}
              step={1}
              onChange={(value) => patch({ upperMm: value })}
            />
            <NumberControl
              label="Lower link"
              unit="mm"
              value={config.lowerMm}
              min={10}
              max={300}
              step={1}
              onChange={(value) => patch({ lowerMm: value })}
            />
            <h3 className="mt-5 text-sm font-medium">Requested foot position</h3>
            <NumberControl
              label="Target x"
              unit="mm"
              value={config.targetXmm}
              min={-300}
              max={500}
              step={1}
              onChange={(value) => patch({ targetXmm: value })}
            />
            {config.joints === 3 && (
              <NumberControl
                label="Target y"
                unit="mm"
                value={config.targetYmm}
                min={-300}
                max={300}
                step={1}
                onChange={(value) => patch({ targetYmm: value })}
              />
            )}
            <NumberControl
              label="Target z (up)"
              unit="mm"
              value={config.targetZmm}
              min={-400}
              max={300}
              step={1}
              onChange={(value) => patch({ targetZmm: value })}
            />
            <details className="mt-4">
              <summary className="min-h-11 cursor-pointer text-sm font-medium">
                Joint travel limits
              </summary>
              <div className="grid grid-cols-2 gap-3">
                <AngleLimit
                  label="Hip minimum"
                  value={config.hipMinDeg}
                  onChange={(value) => patch({ hipMinDeg: value })}
                />
                <AngleLimit
                  label="Hip maximum"
                  value={config.hipMaxDeg}
                  onChange={(value) => patch({ hipMaxDeg: value })}
                />
                <AngleLimit
                  label="Knee minimum"
                  value={config.kneeMinDeg}
                  onChange={(value) => patch({ kneeMinDeg: value })}
                />
                <AngleLimit
                  label="Knee maximum"
                  value={config.kneeMaxDeg}
                  onChange={(value) => patch({ kneeMaxDeg: value })}
                />
                {config.joints === 3 && (
                  <>
                    <AngleLimit
                      label="Yaw minimum"
                      value={config.yawMinDeg}
                      onChange={(value) => patch({ yawMinDeg: value })}
                    />
                    <AngleLimit
                      label="Yaw maximum"
                      value={config.yawMaxDeg}
                      onChange={(value) => patch({ yawMaxDeg: value })}
                    />
                  </>
                )}
              </div>
            </details>
          </Tabs.Content>
          <Tabs.Content value="gait" className="p-4">
            <h2 className="text-sm font-semibold">Walking pattern</h2>
            <p className="mt-1 text-xs text-dust">
              Preview contact timing and inspect each leg across a prescribed step.
            </p>
            <Select
              label="Leg count"
              value={String(config.legCount)}
              onChange={(value) =>
                patch({
                  legCount: Number(value) as 4 | 6 | 8,
                  ...(value !== "6" && config.gait === "tripod" ? { gait: "wave" as const } : {}),
                })
              }
              options={[
                ["4", "4 legs"],
                ["6", "6 legs"],
                ["8", "8 legs"],
              ]}
            />
            <Select
              label="Gait pattern"
              value={config.gait}
              onChange={(value) => patch({ gait: value as LegConfig["gait"] })}
              options={[
                ...(config.legCount === 6
                  ? [["tripod", "Tripod · alternating threes"] as [string, string]]
                  : []),
                ["wave", "Wave · sequential swing"],
                ["ripple", "Ripple · phased rows"],
              ]}
            />
            <NumberControl
              label="Body length"
              unit="mm"
              value={config.bodyLengthMm}
              min={40}
              max={500}
              step={1}
              onChange={(value) => patch({ bodyLengthMm: value })}
            />
            <NumberControl
              label="Body width"
              unit="mm"
              value={config.bodyWidthMm}
              min={30}
              max={400}
              step={1}
              onChange={(value) => patch({ bodyWidthMm: value })}
            />
            <NumberControl
              label="Stride length"
              unit="mm"
              value={config.strideMm}
              min={0}
              max={180}
              step={1}
              onChange={(value) => patch({ strideMm: value })}
            />
            <NumberControl
              label="Step height"
              unit="mm"
              value={config.stepHeightMm}
              min={0}
              max={100}
              step={1}
              onChange={(value) => patch({ stepHeightMm: value })}
            />
            <NumberControl
              label="Cycle duration"
              unit="s"
              value={config.cycleSeconds}
              min={0.5}
              max={8}
              step={0.1}
              onChange={(value) => patch({ cycleSeconds: value })}
            />
            <NumberControl
              label="Stance fraction"
              unit="%"
              value={config.dutyFactor * 100}
              min={35}
              max={95}
              step={1}
              onChange={(value) => patch({ dutyFactor: value / 100 })}
            />
            <h3 className="mt-5 text-sm font-medium">Projected center of mass</h3>
            <NumberControl
              label="COM fore/aft"
              unit="mm"
              value={config.comXmm}
              min={-300}
              max={300}
              step={1}
              onChange={(value) => patch({ comXmm: value })}
            />
            <NumberControl
              label="COM left/right"
              unit="mm"
              value={config.comYmm}
              min={-300}
              max={300}
              step={1}
              onChange={(value) => patch({ comYmm: value })}
            />
            <Button
              className="mt-4 w-full"
              onClick={() => {
                setPlaying(false);
                setPhase(0);
                patch({ phase: 0, comXmm: 0, comYmm: 0 });
              }}
            >
              <RotateCcw className="size-4" aria-hidden />
              Reset phase & balance
            </Button>
          </Tabs.Content>
          <Tabs.Content value="loads" className="p-4">
            <h2 className="text-sm font-semibold">Mass & actuator data</h2>
            <p className="mt-1 text-xs text-dust">
              Static sizing uses the current contact count and the displayed leg pose.
            </p>
            <NumberControl
              label="Body mass (no legs)"
              unit="g"
              value={config.bodyMassG}
              min={0}
              max={10000}
              step={10}
              onChange={(value) => patch({ bodyMassG: value })}
            />
            <NumberControl
              label="Payload mass"
              unit="g"
              value={config.payloadG}
              min={0}
              max={5000}
              step={10}
              onChange={(value) => patch({ payloadG: value })}
            />
            <NumberControl
              label="Mass per link"
              unit="g"
              value={config.linkMassG}
              min={0}
              max={500}
              step={1}
              onChange={(value) => patch({ linkMassG: value })}
            />
            <Button
              className="mt-3 w-full"
              onClick={() => {
                const items = useLab.getState().engineering.flight.massItems;
                const total = items.reduce((sum, item) => sum + item.massG, 0);
                const payload = items
                  .filter((item) => item.id === "payload")
                  .reduce((sum, item) => sum + item.massG, 0);
                patch({
                  bodyMassG: Math.max(0, total - payload - config.legCount * config.linkMassG * 2),
                  payloadG: payload,
                });
                setNotice(
                  "Mass budget copied; estimated link mass was subtracted to avoid double counting.",
                );
              }}
            >
              Use project mass budget
            </Button>
            <NumberControl
              label="Service factor"
              unit="×"
              value={config.serviceFactor}
              min={1}
              max={5}
              step={0.1}
              onChange={(value) => patch({ serviceFactor: value })}
            />
            <NumberControl
              label="Entered servo torque"
              unit="N·m"
              value={config.servoTorqueNm}
              min={0}
              max={15}
              step={0.01}
              onChange={(value) => patch({ servoTorqueNm: value })}
            />
            <NumberControl
              label="Rating supply voltage"
              unit="V"
              value={config.servoVoltageV}
              min={3}
              max={24}
              step={0.1}
              onChange={(value) => patch({ servoVoltageV: value })}
            />
            <label className="mt-4 block text-xs font-medium">
              Servo datasheet / test reference
              <textarea
                aria-label="Servo rating source"
                value={config.servoSource}
                onChange={(event) => patch({ servoSource: event.target.value })}
                maxLength={1000}
                rows={3}
                placeholder="Part number, source URL, rating type, test conditions…"
                className="mt-2 w-full rounded-md border border-line bg-hangar p-3 text-sm font-normal"
              />
            </label>
            <p className="mt-3 text-xs text-dust">
              1 kgf·cm = 0.0980665 N·m. Enter a rating and voltage from an actual part
              specification; the default is an illustrative planning input.
            </p>
          </Tabs.Content>
        </Tabs.Root>
      </section>
    </div>
  );
}

function NumberControl(props: Parameters<typeof NumField>[0]) {
  return <NumField {...props} />;
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 p-3">
      <p className="text-xs text-dust">{label}</p>
      <p className="mt-1 break-words font-mono text-sm font-medium text-paper">{value}</p>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-hangar p-3">
      <p className="text-xs text-dust">{label}</p>
      <p className="mt-1 font-mono text-sm font-medium">{value}</p>
    </div>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-4 block text-xs font-medium">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-md border border-line bg-hangar px-3 text-sm text-paper"
      >
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
function AngleLimit({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs text-dust">
      {label} (°)
      <input
        type="number"
        min={-180}
        max={180}
        step={1}
        value={value}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value)) onChange(Math.max(-180, Math.min(180, value)));
        }}
        className="mt-1 min-h-11 w-full rounded-md border border-line bg-hangar px-2 text-sm text-paper"
      />
    </label>
  );
}

type Theme = {
  background: string;
  raised: string;
  foreground: string;
  muted: string;
  line: string;
  accent: string;
  danger: string;
  success: string;
};
type Draw = (ctx: CanvasRenderingContext2D, width: number, height: number, theme: Theme) => void;
function DiagramCanvas({ label, draw }: { label: string; draw: Draw }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const paintRef = useRef(() => {});
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const paint = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (
        canvas.width !== Math.round(width * ratio) ||
        canvas.height !== Math.round(height * ratio)
      ) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const style = getComputedStyle(canvas);
      const color = (name: string) => style.getPropertyValue(`--color-${name}`).trim();
      drawRef.current(ctx, width, height, {
        background: color("hangar"),
        raised: color("raised"),
        foreground: color("paper"),
        muted: color("dust"),
        line: color("line"),
        accent: color("cyan"),
        danger: color("magenta"),
        success: color("mint"),
      });
    };
    paintRef.current = paint;
    const resize = new ResizeObserver(paint);
    resize.observe(host);
    paint();
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    paintRef.current();
  }, [draw]);
  return (
    <div ref={hostRef} className="h-80 min-w-0 bg-hangar">
      <canvas ref={canvasRef} role="img" aria-label={label} className="block h-full w-full" />
    </div>
  );
}

function axes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: Theme,
  originX: number,
  originY: number,
  scale: number,
) {
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1;
  const grid = scale * 50;
  for (let x = originX % grid; x < width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = originY % grid; y < height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = theme.muted;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(0, originY);
  ctx.lineTo(width, originY);
  ctx.moveTo(originX, 0);
  ctx.lineTo(originX, height);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = "11px ui-sans-serif, system-ui";
  ctx.fillStyle = theme.muted;
  ctx.fillText("50 mm grid", 12, height - 12);
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: Theme,
  config: LegConfig,
  solution: LegSolution,
) {
  const coxa = config.joints === 3 ? config.coxaMm : 0;
  const range = Math.max(
    config.upperMm + config.lowerMm,
    Math.hypot(solution.target.x, solution.target.y) - coxa,
    Math.abs(solution.target.z),
    50,
  );
  const scale = Math.min((width - 56) / (range * 2 + coxa), (height - 56) / (range * 2));
  const ox = width / 2 - (coxa * scale) / 2;
  const oy = height / 2;
  axes(ctx, width, height, theme, ox, oy, scale);
  const point = (x: number, z: number) => ({ x: ox + x * scale, y: oy - z * scale });
  const yaw = (solution.yawDeg * Math.PI) / 180;
  const radial = (p: { x: number; y: number }) => p.x * Math.cos(yaw) + p.y * Math.sin(yaw);
  const center = point(coxa, 0);
  ctx.fillStyle = theme.raised;
  ctx.beginPath();
  ctx.arc(center.x, center.y, solution.maxReachMm * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.background;
  ctx.beginPath();
  ctx.arc(center.x, center.y, solution.minReachMm * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(center.x, center.y, solution.maxReachMm * scale, 0, Math.PI * 2);
  ctx.stroke();
  const points = [
    point(0, 0),
    point(radial(solution.hip), solution.hip.z),
    point(radial(solution.elbow), solution.elbow.z),
    point(radial(solution.foot), solution.foot.z),
  ];
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();
  ctx.fillStyle = theme.foreground;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const targetR =
    config.joints === 3 ? Math.hypot(solution.target.x, solution.target.y) : solution.target.x;
  const target = point(targetR, solution.target.z);
  ctx.strokeStyle = solution.withinLimits ? theme.success : theme.danger;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(target.x - 7, target.y);
  ctx.lineTo(target.x + 7, target.y);
  ctx.moveTo(target.x, target.y - 7);
  ctx.lineTo(target.x, target.y + 7);
  ctx.stroke();
  ctx.font = "11px ui-sans-serif, system-ui";
  ctx.fillStyle = theme.foreground;
  ctx.fillText("Hip", points[1]!.x + 7, points[1]!.y - 9);
  ctx.fillText("Knee", points[2]!.x + 7, points[2]!.y - 9);
  ctx.fillText(
    `Target (${number(solution.target.x, 0)}, ${number(solution.target.y, 0)}, ${number(solution.target.z, 0)})`,
    12,
    20,
  );
  ctx.fillStyle = theme.muted;
  ctx.fillText("z up", ox + 6, 36);
  ctx.fillText("radial x →", width - 82, oy - 8);
}

function drawContacts(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: Theme,
  config: LegConfig,
  frame: GaitFrame,
) {
  const rangeX = Math.max(
    config.bodyLengthMm / 2 + config.strideMm / 2 + 30,
    Math.abs(config.comXmm) + 20,
  );
  const rangeY = Math.max(
    config.bodyWidthMm / 2 + Math.abs(config.targetXmm) + 30,
    Math.abs(config.comYmm) + 20,
  );
  const scale = Math.min((width - 64) / (rangeX * 2), (height - 60) / (rangeY * 2));
  const ox = width / 2;
  const oy = height / 2;
  axes(ctx, width, height, theme, ox, oy, scale);
  const point = (p: { x: number; y: number }) => ({ x: ox + p.x * scale, y: oy - p.y * scale });
  if (frame.support.length >= 3) {
    const points = frame.support.map(point);
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = 0.1;
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.fillStyle = theme.raised;
  ctx.strokeStyle = theme.muted;
  ctx.lineWidth = 1;
  ctx.fillRect(
    ox - (config.bodyLengthMm * scale) / 2,
    oy - (config.bodyWidthMm * scale) / 2,
    config.bodyLengthMm * scale,
    config.bodyWidthMm * scale,
  );
  ctx.strokeRect(
    ox - (config.bodyLengthMm * scale) / 2,
    oy - (config.bodyWidthMm * scale) / 2,
    config.bodyLengthMm * scale,
    config.bodyWidthMm * scale,
  );
  for (const foot of frame.feet) {
    const p = point(foot);
    const row = Math.floor(foot.index / 2);
    const side = foot.index % 2 === 0 ? 1 : -1;
    const hip = point({
      x:
        config.bodyLengthMm / 2 -
        (row * config.bodyLengthMm) / Math.max(1, config.legCount / 2 - 1),
      y: (side * config.bodyWidthMm) / 2,
    });
    ctx.strokeStyle = theme.muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.fillStyle = foot.grounded ? theme.accent : theme.background;
    ctx.strokeStyle = foot.solution.withinLimits ? theme.accent : theme.danger;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = theme.foreground;
    ctx.font = "11px ui-sans-serif, system-ui";
    ctx.fillText(foot.id, p.x + 9, p.y + 4);
  }
  const com = point({ x: config.comXmm, y: config.comYmm });
  ctx.strokeStyle = frame.stable ? theme.success : theme.danger;
  ctx.fillStyle = theme.background;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(com.x, com.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(com.x - 10, com.y);
  ctx.lineTo(com.x + 10, com.y);
  ctx.moveTo(com.x, com.y - 10);
  ctx.lineTo(com.x, com.y + 10);
  ctx.stroke();
  ctx.fillStyle = theme.foreground;
  ctx.fillText("COM", com.x + 12, com.y - 8);
  ctx.fillStyle = theme.muted;
  ctx.fillText("Y left ↑", 12, 20);
  ctx.fillText("X forward →", width - 88, height - 12);
}
