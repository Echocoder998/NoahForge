import { localProjectDate } from "@/lib/engineering/types";
import { useLab } from "@/lib/lab-store";
import { analyzeProject, archetypeLabels, isWalking } from "@/lib/engineering/archetypes";
import type { FlightConfig, SizingConfig } from "@/lib/engineering/types";
import { SizingField, SizingMetric, SizingSection, sizingFormat as f } from "./sizing-fields";
import { ProjectEstimates } from "./project-estimates";
import { downloadBlob, slug } from "@/lib/aero/stl";
import { Button } from "@/components/ui/button";
export function CalculatorHub({ section = "calculators" }: { section?: string }) {
  const p = useLab((s) => s.engineering);
  const patch = useLab((s) => s.patchEngineering);
  const r = analyzeProject(p);
  const updateRow = (id: string, values: Record<string, number | string>) =>
    patch({
      flight: {
        ...p.flight,
        massItems: p.flight.massItems.map((row) => (row.id === id ? { ...row, ...values } : row)),
      },
    });
  const walking = isWalking(p.archetype);
  const setSizing = (key: keyof SizingConfig, value: number) =>
    patch({ sizing: { ...p.sizing, [key]: value } });
  const setFlight = (key: keyof FlightConfig, value: number) =>
    patch({ flight: { ...p.flight, [key]: value } });
  const sizingFields: [keyof SizingConfig, string, string, number?, number?][] = walking
    ? [
        ["servoContinuousA", "Continuous current per servo", "A"],
        ["servoStallA", "Stall current per servo", "A"],
        ["additionalActuators", "Additional arm / head actuators", "count", 0, 100],
        ["actuatorMassG", "Unit actuator mass", "g"],
        ["actuatorCostUsd", "Unit actuator cost", "USD"],
      ]
    : p.archetype === "rover"
      ? [
          ["driveMotors", "Driven wheels / motors", "count", 1, 16],
          ["wheelRadiusMm", "Wheel radius", "mm", 1, 2000],
          ["gearRatio", "Reduction ratio (motor : wheel)", ":1", 0.1, 1000],
          ["motorRpm", "Motor speed under load", "rpm"],
          ["slopeDeg", "Incline angle", "deg", 0, 80],
          ["rollingResistance", "Rolling resistance coefficient", "", 0, 1],
          ["tractionCoefficient", "Tire traction coefficient", "", 0, 2],
          ["motorIdleA", "No-load current per motor", "A"],
          ["targetRangeM", "Target travel range", "m"],
          ["motorMassG", "Unit motor mass", "g"],
          ["motorCostUsd", "Unit motor cost", "USD"],
        ]
      : [
          ["motorMassG", "Unit motor mass", "g"],
          ["motorCostUsd", "Unit motor cost", "USD"],
        ];
  const metrics: [string, number | null, string][] = walking
    ? [
        ["Actuator count", r.actuatorCount, "servos"],
        ["Required joint stall torque", r.jointTorqueNcm, "N·cm"],
        ["Servo bus continuous current", r.busContinuousA, "A"],
        ["Servo bus peak current", r.busPeakA, "A"],
        ["Stride speed", r.strideSpeedMs, "m/s"],
      ]
    : p.archetype === "rover"
      ? [
          ["Required torque per wheel", r.wheelTorqueNcm, "N·cm"],
          ["Required motor torque", r.motorTorqueNcm, "N·cm"],
          ["Drive speed", r.driveSpeedMs, "m/s"],
          ["Incline drive power", r.drivePowerW, "W"],
          ["Expected range", r.rangeM, "m"],
        ]
      : p.archetype === "fixed_wing"
        ? [
            ["Cruise flight time", r.runtimeMin, "min"],
            ["Stall speed estimate", r.stallSpeedMs, "m/s"],
          ]
        : [
            ["Thrust-to-weight ratio", r.thrustToWeight, ":1 (target ≥ 2)"],
            ["Hover flight time", r.runtimeMin, "min"],
            ["Rotor disk loading", r.diskLoadingNm2, "N/m²"],
            ["Ideal induced hover power", r.idealHoverPowerW, "W (lower bound)"],
          ];
  return (
    <div className="space-y-4">
      <SizingSection
        title={`${archetypeLabels[p.archetype]} — ${section === "aerodynamics" ? "Aerodynamics" : "Engineering calculators"}`}
      >
        <p className="text-sm text-dust">
          Inputs and results share project state. Editing the Mission budget or component BOM
          updates these estimates immediately. Calculator-linked actuator or motor rows update
          automatically; no duplicate mass is added.
        </p>
        <ProjectEstimates />
      </SizingSection>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, unit]) => (
          <SizingMetric key={label} label={label} value={f(value, 2)} unit={unit} />
        ))}
      </div>
      <SizingSection title="Sizing inputs">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sizingFields.map(([key, label, unit, min = 0, max = 100000]) => (
            <SizingField
              key={key}
              label={label}
              unit={unit}
              value={Number(p.sizing[key])}
              min={min}
              max={max}
              step={unit === "count" ? 1 : 0.01}
              onChange={(v) => setSizing(key, unit === "count" ? Math.round(v) : v)}
            />
          ))}
          {walking && (
            <>
              <SizingField
                label="Leg count"
                unit="legs"
                value={p.leg.legCount}
                min={2}
                max={8}
                step={2}
                onChange={(v) =>
                  patch({
                    leg: {
                      ...p.leg,
                      legCount: ([2, 4, 6, 8].includes(v) ? v : 6) as 2 | 4 | 6 | 8,
                    },
                  })
                }
              />
              <SizingField
                label="DoF per leg"
                unit="joints"
                value={p.leg.joints}
                min={2}
                max={3}
                onChange={(v) => patch({ leg: { ...p.leg, joints: Math.round(v) as 2 | 3 } })}
              />
              <SizingField
                label="Stride length"
                unit="mm"
                value={p.leg.strideMm}
                onChange={(v) => patch({ leg: { ...p.leg, strideMm: v } })}
              />
              <SizingField
                label="Gait cycle period"
                unit="s"
                min={0.1}
                step={0.1}
                value={p.leg.cycleSeconds}
                onChange={(v) => patch({ leg: { ...p.leg, cycleSeconds: v } })}
              />
              <SizingField
                label="Servo bus voltage"
                unit="V"
                min={0.1}
                step={0.1}
                value={p.leg.servoVoltageV}
                onChange={(v) => patch({ leg: { ...p.leg, servoVoltageV: v } })}
              />
              <SizingField
                label="Selected servo stall torque"
                unit="N·cm"
                value={p.leg.servoTorqueNm * 100}
                onChange={(v) => patch({ leg: { ...p.leg, servoTorqueNm: v / 100 } })}
              />
            </>
          )}
          {p.archetype === "multirotor" && (
            <>
              <SizingField
                label="Propeller diameter"
                unit="mm"
                min={1}
                max={3000}
                value={p.sizing.rotorDiameterMm}
                onChange={(v) => setSizing("rotorDiameterMm", v)}
              />
              <SizingField
                label="Rotor count"
                unit="motors"
                min={1}
                max={16}
                value={p.flight.rotorCount}
                onChange={(v) => setFlight("rotorCount", Math.round(v))}
              />
              <SizingField
                label="Maximum thrust per motor"
                unit="g-force"
                value={p.flight.thrustPerMotorG}
                onChange={(v) => setFlight("thrustPerMotorG", v)}
              />
              <SizingField
                label="Measured hover current per motor"
                unit="A"
                step={0.1}
                value={p.flight.hoverCurrentPerMotorA}
                onChange={(v) => setFlight("hoverCurrentPerMotorA", v)}
              />
            </>
          )}
          {p.archetype === "fixed_wing" && (
            <>
              <SizingField
                label="Cruise propulsion current"
                unit="A"
                step={0.1}
                value={p.flight.cruiseCurrentA}
                onChange={(v) => setFlight("cruiseCurrentA", v)}
              />
              <SizingField
                label="Wing area"
                unit="dm²"
                min={0.1}
                value={p.flight.wingAreaDm2}
                onChange={(v) => setFlight("wingAreaDm2", v)}
              />
              <SizingField
                label="Maximum lift coefficient"
                unit="CL"
                min={0.1}
                step={0.1}
                value={p.flight.clMax}
                onChange={(v) => setFlight("clMax", v)}
              />
              <SizingField
                label="Air density"
                unit="kg/m³"
                min={0.01}
                step={0.01}
                value={p.flight.airDensity}
                onChange={(v) => setFlight("airDensity", v)}
              />
            </>
          )}
        </div>
      </SizingSection>
      <SizingSection title="Battery and power limits">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SizingField
            label="Battery capacity"
            unit="mAh"
            min={1}
            value={p.flight.batteryMah}
            onChange={(v) => setFlight("batteryMah", v)}
          />
          <SizingField
            label="Battery series cells"
            unit="cells"
            min={1}
            max={12}
            value={p.flight.cellCount}
            onChange={(v) => setFlight("cellCount", Math.round(v))}
          />
          <SizingField
            label="Usable battery fraction"
            unit="fraction"
            min={0.05}
            max={1}
            step={0.05}
            value={p.flight.usableFraction}
            onChange={(v) => setFlight("usableFraction", v)}
          />
          <SizingField
            label="Electronics current"
            unit="A"
            step={0.1}
            value={p.flight.electronicsCurrentA}
            onChange={(v) => setFlight("electronicsCurrentA", v)}
          />
          <SizingField
            label="Power / servo bus current limit"
            unit="A"
            value={p.sizing.busLimitA}
            onChange={(v) => setSizing("busLimitA", v)}
          />
          <SizingField
            label="Drive / voltage converter efficiency"
            unit="fraction"
            min={0.01}
            max={1}
            step={0.05}
            value={p.sizing.efficiency}
            onChange={(v) => setSizing("efficiency", v)}
          />
        </div>
      </SizingSection>
      <SizingSection title="Component BOM — mass and cost budget">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={p.sizing.autoBom}
            onChange={(e) => patch({ sizing: { ...p.sizing, autoBom: e.target.checked } })}
          />
          Automatically link actuator / motor count, unit mass and cost
        </label>
        <div className="grid gap-3 lg:grid-cols-2">
          {p.flight.massItems.map((row) => (
            <div key={row.id} className="rounded border border-line p-3">
              <label className="block text-xs text-dust">
                Component name
                <input
                  aria-label={`Component name ${row.name}`}
                  className="engineering-input mt-1"
                  value={row.name}
                  maxLength={160}
                  onChange={(e) => updateRow(row.id, { name: e.target.value })}
                />
              </label>
              <details>
                <summary className="min-h-11 cursor-pointer py-2 text-xs text-dust">
                  Position and source
                </summary>
                <div className="grid grid-cols-3 gap-2">
                  {(["xMm", "yMm", "zMm"] as const).map((axis) => (
                    <SizingField
                      key={axis}
                      label={`${row.name} ${axis}`}
                      unit="mm"
                      min={-100000}
                      value={row[axis]}
                      onChange={(v) => updateRow(row.id, { [axis]: v })}
                    />
                  ))}
                </div>
                <label className="mt-2 block text-xs text-dust">
                  Measurement / supplier source
                  <input
                    className="engineering-input"
                    aria-label={`${row.name} source`}
                    value={row.source}
                    maxLength={12000}
                    onChange={(e) => updateRow(row.id, { source: e.target.value })}
                  />
                </label>
              </details>
              <Button
                variant="ghost"
                disabled={p.sizing.autoBom && row.id === "propulsion"}
                onClick={() =>
                  patch({
                    flight: {
                      ...p.flight,
                      massItems: p.flight.massItems.filter((x) => x.id !== row.id),
                    },
                  })
                }
              >
                Remove component
              </Button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["massG", "costUsd"] as const).map((key) => (
                  <SizingField
                    key={key}
                    label={`${row.name} ${key === "massG" ? "mass" : "cost"}`}
                    unit={key === "massG" ? "g" : "USD"}
                    value={row[key]}
                    step={0.1}
                    onChange={(v) =>
                      patch({
                        flight: {
                          ...p.flight,
                          massItems: p.flight.massItems.map((x) =>
                            x.id === row.id ? { ...x, [key]: v } : x,
                          ),
                        },
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <Button
          className="mt-3"
          disabled={p.flight.massItems.length >= 64}
          onClick={() =>
            patch({
              flight: {
                ...p.flight,
                massItems: [
                  ...p.flight.massItems,
                  {
                    id: crypto.randomUUID(),
                    name: "Additional component",
                    massG: 0,
                    costUsd: 0,
                    xMm: 0,
                    yMm: 0,
                    zMm: 0,
                    source: "Planning estimate",
                  },
                ],
              },
            })
          }
        >
          Add component
        </Button>
      </SizingSection>
      <SizingMetric
        label="Center of mass (X, Y, Z)"
        value={
          r.centerOfMass
            ? `${f(r.centerOfMass.xMm)}, ${f(r.centerOfMass.yMm)}, ${f(r.centerOfMass.zMm)}`
            : "Undefined at zero mass"
        }
        unit="mm"
      />
      <Button
        onClick={() =>
          downloadBlob(
            `${slug(useLab.getState().projectName)}-sizing.csv`,
            [
              ["Archetype", archetypeLabels[p.archetype]],
              ...metrics.map(([label, value, unit]) => [label, value ?? "Undefined", unit]),
              ...p.flight.massItems.map((row) => [
                row.name,
                row.massG,
                "g",
                row.costUsd,
                "USD",
                row.source,
              ]),
            ]
              .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
              .join("\r\n"),
            "text/csv",
          )
        }
      >
        Export sizing CSV
      </Button>
      <Button
        disabled={p.notebook.length >= 100}
        onClick={() =>
          patch({
            notebook: [
              ...p.notebook,
              {
                id: crypto.randomUUID(),
                date: localProjectDate(),
                title: `${archetypeLabels[p.archetype]} sizing`,
                kind: "decision",
                procedure: "Archetype-specific planning calculation; validate with bench data.",
                predicted: r.runtimeMin,
                measured: null,
                unit: "min",
                notes:
                  metrics
                    .map(([label, value, unit]) => `${label}: ${f(value, 3)} ${unit}`)
                    .join("; ") +
                  ". " +
                  r.notices.join(" "),
                photos: [],
              },
            ],
          })
        }
      >
        Record calculation in notebook
      </Button>
      <SizingSection title="Assumptions and checks">
        <ul className="list-disc space-y-2 pl-5 text-sm">
          {r.notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-dust">
          {walking
            ? "Walking torque = weight / supporting legs × maximum link reach × service factor (N·m × 100 = N·cm). Bus currents sum all actuators. Runtime uses usable battery Wh / electrical W, including converter efficiency. Stride speed = stride / cycle. Biped balance and impact loads require dynamic testing."
            : p.archetype === "rover"
              ? "Wheel torque = (incline force + rolling resistance) × radius / driven wheels × service factor. Motor torque divides by reduction and efficiency. Travel speed uses entered loaded motor RPM. Range assumes a constant slope, load and speed; verify against motor torque-speed curves and terrain tests."
              : p.archetype === "multirotor"
                ? "Thrust-to-weight = combined maximum motor thrust / vehicle weight. Hover time = usable battery Ah / measured hover current × 60. Ideal induced power = W^(3/2) / sqrt(2 rho A), an aerodynamic lower bound, not battery draw. Use matched motor, propeller, pack voltage and bench data."
                : "Cruise time = usable battery Ah / cruise and electronics current × 60. Stall speed = sqrt(2 W / (rho S CLmax)). Enter measured wing area and sourced lift coefficients; this model does not establish a flight envelope."}
        </p>
      </SizingSection>
    </div>
  );
}
