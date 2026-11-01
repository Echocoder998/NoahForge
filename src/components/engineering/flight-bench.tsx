import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Download, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { useLab } from "@/lib/lab-store";
import { analyzeFlight } from "@/lib/engineering/flight";
import type { FlightConfig, MassItem, NotebookEntry } from "@/lib/engineering/types";
import { localProjectDate } from "@/lib/engineering/types";
import { downloadBlob, slug } from "@/lib/aero/stl";
import { SizingField, SizingMetric, SizingSection, sizingFormat as f } from "./sizing-fields";

export function FlightBench() {
  const flight = useLab((state) => state.engineering.flight);
  const mission = useLab((state) => state.engineering.mission);
  const projectName = useLab((state) => state.projectName);
  const patchEngineering = useLab((state) => state.patchEngineering);
  const setMass = useLab((state) => state.setMass);
  const [notice, setNotice] = useState("");
  const result = analyzeFlight(flight);
  const patch = (next: Partial<FlightConfig>) =>
    patchEngineering({ flight: { ...flight, ...next } });
  const updateItem = (id: string, next: Partial<MassItem>) =>
    patch({
      massItems: flight.massItems.map((item) => (item.id === id ? { ...item, ...next } : item)),
    });
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
      title: "Flight sizing estimate",
      kind: "decision",
      procedure:
        "Analytical estimate using the mass budget and entered propulsion current/thrust. Verify against bench measurements.",
      predicted: result.hoverRuntimeMin,
      measured: null,
      unit: "min",
      notes: `Mass ${f(result.totalMassG)} g; cost $${f(result.totalCostUsd, 2)}; thrust/weight ${f(result.thrustToWeight, 2)}; hover current ${f(result.hoverCurrentA)} A. Source: ${flight.thrustSource || "Unverified planning input"}. ${result.notices.join(" ")}`,
      photos: [],
    };
    patchEngineering({ notebook: [...useLab.getState().engineering.notebook, entry] });
    setNotice("Calculation saved to the experiment notebook.");
  };
  const exportSizing = () => {
    const rows = [
      ["Quantity", "Value", "Unit", "Basis"],
      ["Total mass", result.totalMassG, "g", "Sum of mass rows"],
      ["Total cost", result.totalCostUsd, "USD", "Sum of cost rows; excludes unspecified costs"],
      ["Center of mass X", result.cg?.xMm ?? "undefined", "mm", "Sum(m*x)/sum(m)"],
      ["Center of mass Y", result.cg?.yMm ?? "undefined", "mm", "Sum(m*y)/sum(m)"],
      ["Center of mass Z", result.cg?.zMm ?? "undefined", "mm", "Sum(m*z)/sum(m)"],
      [
        "Thrust/weight",
        result.thrustToWeight ?? "undefined",
        "ratio",
        flight.thrustSource || "Unsourced planning assumption",
      ],
      [
        "Hover runtime",
        result.hoverRuntimeMin ?? "undefined",
        "min",
        "Usable Ah / total hover A * 60",
      ],
      [
        "Cruise runtime",
        result.cruiseRuntimeMin ?? "undefined",
        "min",
        "Usable Ah / total cruise A * 60",
      ],
      [
        "Stall speed estimate",
        result.stallSpeedMs ?? "undefined",
        "m/s",
        "Steady lift equation with assumed CLmax",
      ],
      ...flight.massItems.map((item) => [
        `Mass item: ${item.name}`,
        item.massG,
        "g",
        item.source || "unsourced",
      ]),
    ];
    downloadBlob(
      `${slug(projectName)}-flight-sizing.csv`,
      rows
        .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
        .join("\r\n"),
      "text/csv",
    );
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-lg border border-line bg-panel p-4 text-sm">
        <p className="font-medium">Sizing and balance calculations</p>
        <p className="mt-1 text-dust">
          All starting values are planning assumptions. Enter measured masses and a matching
          motor/propeller/battery test reference. This workspace does not model flight dynamics or
          certify an aircraft.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SizingMetric
          label="Vehicle mass"
          value={f(result.totalMassG, 0)}
          unit="g"
          help={`Mission limit ${f(mission.maxMassG, 0)} g · ${result.totalMassG <= mission.maxMassG ? "within entered limit" : "over entered limit"}`}
        />
        <SizingMetric
          label="Estimated parts cost"
          value={`$${f(result.totalCostUsd, 2)}`}
          help={`Budget $${f(mission.budgetUsd, 0)} · shipping and tools not included`}
        />
        <SizingMetric
          label="Maximum thrust / weight"
          value={f(result.thrustToWeight, 2)}
          unit=": 1"
          help="Maximum static thrust input, not cruise performance"
        />
        <SizingMetric
          label="Hover runtime estimate"
          value={f(result.hoverRuntimeMin)}
          unit="min"
          help={`Target ${f(mission.targetRuntimeMin, 0)} min · constant entered current`}
        />
      </div>
      <Tabs.Root defaultValue="mass" className="min-w-0 rounded-xl border border-line bg-panel">
        <Tabs.List
          aria-label="Flight sizing sections"
          className="flex flex-wrap gap-1 border-b border-line p-2"
        >
          {[
            ["mass", "Mass & balance"],
            ["propulsion", "Propulsion & battery"],
            ["wing", "Fixed-wing estimates"],
          ].map(([id, label]) => (
            <Tabs.Trigger
              key={id}
              value={id!}
              className="min-h-11 rounded-md px-3 text-sm text-dust data-[state=active]:bg-raised data-[state=active]:text-cyan"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="mass" className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Component mass budget</h2>
              <p className="mt-1 text-xs text-dust">
                Coordinates share one reference origin. Use X forward, Y left, Z up consistently for
                every item.
              </p>
            </div>
            <Button
              onClick={() =>
                patch({
                  massItems: [
                    ...flight.massItems,
                    {
                      id: crypto.randomUUID(),
                      name: "New component",
                      massG: 0,
                      costUsd: 0,
                      xMm: 0,
                      yMm: 0,
                      zMm: 0,
                      source: "",
                    },
                  ],
                })
              }
            >
              <Plus className="size-4" aria-hidden />
              Add mass item
            </Button>
          </div>
          {flight.massItems.length === 0 && (
            <p className="rounded-md border border-line p-4 text-sm text-dust">
              Add a component to start a mass budget. Center of mass is undefined until total mass
              is positive.
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {flight.massItems.map((item) => (
              <article
                key={item.id}
                className="min-w-0 rounded-lg border border-line bg-hangar p-3"
              >
                <div className="flex items-center gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Component name</span>
                    <input
                      aria-label={`Mass item name ${item.name}`}
                      value={item.name}
                      maxLength={80}
                      onChange={(event) => updateItem(item.id, { name: event.target.value })}
                      className="min-h-11 w-full min-w-0 rounded-md border border-line bg-panel px-3 text-sm font-medium"
                    />
                  </label>
                  <Button
                    variant="ghost"
                    aria-label={`Remove mass item ${item.name}`}
                    onClick={() =>
                      patch({ massItems: flight.massItems.filter((row) => row.id !== item.id) })
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <SizingField
                    label={`${item.name} mass`}
                    value={item.massG}
                    unit="g"
                    step={0.1}
                    onChange={(massG) => updateItem(item.id, { massG })}
                  />
                  <SizingField
                    label={`${item.name} cost`}
                    value={item.costUsd}
                    unit="USD"
                    step={0.01}
                    onChange={(costUsd) => updateItem(item.id, { costUsd })}
                  />
                </div>
                <details className="mt-3">
                  <summary className="min-h-11 cursor-pointer py-2 text-sm text-cyan">
                    Position and source
                  </summary>
                  <div className="grid grid-cols-3 gap-2">
                    {(["xMm", "yMm", "zMm"] as const).map((axis) => (
                      <SizingField
                        key={axis}
                        label={`${item.name} ${axis[0]!.toUpperCase()} position`}
                        value={item[axis]}
                        unit="mm"
                        min={-10000}
                        max={10000}
                        step={1}
                        onChange={(value) => updateItem(item.id, { [axis]: value })}
                      />
                    ))}
                  </div>
                  <label className="mt-3 block">
                    <span className="mb-1 block text-xs text-dust">
                      Measurement or supplier reference
                    </span>
                    <input
                      value={item.source}
                      maxLength={300}
                      aria-label={`${item.name} source`}
                      onChange={(event) => updateItem(item.id, { source: event.target.value })}
                      placeholder="Scale measurement, part datasheet, or supplier link"
                      className="min-h-11 w-full rounded-md border border-line bg-panel px-3 text-sm"
                    />
                  </label>
                </details>
              </article>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <SizingSection title="Center of mass">
              <p className="font-mono text-lg tabular-nums">
                X {f(result.cg?.xMm ?? null)} · Y {f(result.cg?.yMm ?? null)} · Z{" "}
                {f(result.cg?.zMm ?? null)} mm
              </p>
              <p className="mt-2 text-xs text-dust">
                r̄ = Σ(mᵢ rᵢ) / Σmᵢ. Coordinates are meaningful only relative to your chosen origin.
                Check against the actual support or aerodynamic reference.
              </p>
              <Button
                className="mt-4"
                onClick={() => {
                  if (result.totalMassG > 0) {
                    setMass(result.totalMassG);
                    setNotice("Mass copied to the existing printable-part flight worksheet.");
                  }
                }}
                disabled={result.totalMassG <= 0}
              >
                Use mass in existing flight worksheet
              </Button>
            </SizingSection>
            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-medium">Mass distribution · g</h3>
              <div className="h-56 min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart
                    data={flight.massItems.map((item) => ({
                      name: item.name.length > 14 ? item.name.slice(0, 14) + "…" : item.name,
                      mass: item.massG,
                    }))}
                    margin={{ top: 8, left: 0, right: 12, bottom: 12 }}
                  >
                    <CartesianGrid stroke="var(--color-line)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "var(--color-dust)", fontSize: 10 }}
                      interval={0}
                    />
                    <YAxis tick={{ fill: "var(--color-dust)", fontSize: 11 }} width={40} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-panel)",
                        borderColor: "var(--color-line)",
                        color: "var(--color-paper)",
                      }}
                    />
                    <Bar
                      dataKey="mass"
                      name="Mass (g)"
                      fill="var(--color-cyan)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </Tabs.Content>
        <Tabs.Content value="propulsion" className="space-y-4 p-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <SizingSection title="Motor / propeller test inputs">
              <div className="grid grid-cols-2 gap-3">
                <SizingField
                  label="Rotor count"
                  value={flight.rotorCount}
                  unit="motors"
                  min={1}
                  max={12}
                  onChange={(rotorCount) => patch({ rotorCount: Math.round(rotorCount) })}
                />
                <SizingField
                  label="Maximum thrust per motor"
                  value={flight.thrustPerMotorG}
                  unit="g-force"
                  onChange={(thrustPerMotorG) => patch({ thrustPerMotorG })}
                />
                <SizingField
                  label="Current per motor at hover"
                  value={flight.hoverCurrentPerMotorA}
                  unit="A"
                  step={0.1}
                  max={200}
                  onChange={(hoverCurrentPerMotorA) => patch({ hoverCurrentPerMotorA })}
                />
                <SizingField
                  label="Propulsion test voltage"
                  value={flight.testVoltageV}
                  unit="V"
                  min={0.1}
                  max={100}
                  step={0.1}
                  onChange={(testVoltageV) => patch({ testVoltageV })}
                />
              </div>
              <label className="mt-4 block">
                <span className="mb-1 block text-xs text-dust">
                  Motor, propeller and test/datasheet reference
                </span>
                <textarea
                  aria-label="Propulsion data source"
                  value={flight.thrustSource}
                  maxLength={1000}
                  rows={3}
                  placeholder="Identify hardware, thrust stand/datasheet, voltage and hover-current condition."
                  onChange={(event) => patch({ thrustSource: event.target.value })}
                  className="min-h-24 w-full rounded-md border border-line bg-hangar p-3 text-sm"
                />
              </label>
            </SizingSection>
            <SizingSection title="Battery and current assumptions">
              <div className="grid grid-cols-2 gap-3">
                <SizingField
                  label="Battery capacity"
                  value={flight.batteryMah}
                  unit="mAh"
                  min={1}
                  onChange={(batteryMah) => patch({ batteryMah })}
                />
                <SizingField
                  label="Usable capacity fraction"
                  value={flight.usableFraction}
                  unit="0–1"
                  min={0.01}
                  max={1}
                  step={0.01}
                  onChange={(usableFraction) => patch({ usableFraction })}
                />
                <SizingField
                  label="Series cells"
                  value={flight.cellCount}
                  unit="S"
                  min={1}
                  max={24}
                  onChange={(cellCount) => patch({ cellCount: Math.round(cellCount) })}
                />
                <SizingField
                  label="Electronics current"
                  value={flight.electronicsCurrentA}
                  unit="A"
                  max={100}
                  step={0.05}
                  onChange={(electronicsCurrentA) => patch({ electronicsCurrentA })}
                />
                <SizingField
                  label="Total cruise motor current"
                  value={flight.cruiseCurrentA}
                  unit="A"
                  min={0.01}
                  max={300}
                  step={0.1}
                  onChange={(cruiseCurrentA) => patch({ cruiseCurrentA })}
                />
              </div>
              <p className="mt-3 text-xs text-dust">
                Use average loaded currents from the same vehicle configuration. Cell count changes
                voltage; it does not multiply the pack's Ah rating.
              </p>
            </SizingSection>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SizingMetric
              label="Total maximum thrust"
              value={f(result.totalThrustG, 0)}
              unit="g-force"
            />
            <SizingMetric label="Hover total current" value={f(result.hoverCurrentA, 2)} unit="A" />
            <SizingMetric
              label="Cruise runtime estimate"
              value={f(result.cruiseRuntimeMin)}
              unit="min"
            />
            <SizingMetric
              label="Mass below 1:1 thrust ceiling"
              value={f(result.payloadMarginG, 0)}
              unit="g"
              help="No control reserve; this is not a recommended payload rating"
            />
          </div>
          <details className="rounded-lg border border-line p-4">
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">
              Equations and limitations
            </summary>
            <div className="space-y-2 text-sm text-dust">
              <p>
                Thrust / weight = motor count × maximum static thrust per motor / total mass, using
                g-force and grams consistently.
              </p>
              <p>
                Runtime (min) = 60 × [capacity (mAh) / 1000 × usable fraction] / average total
                current (A).
              </p>
              <p>
                Hover current = motor count × hover current per motor + electronics current. Cruise
                input is already the total motor current; electronics current is added once.
              </p>
              <p>
                Voltage sag, discharge rate, wind, maneuvering, propeller interaction, temperature,
                reserves and aging are outside this constant-current estimate. Maximum-thrust
                current is not hover current.
              </p>
            </div>
          </details>
        </Tabs.Content>
        <Tabs.Content value="wing" className="space-y-4 p-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <SizingSection title="Steady lift model">
              <div className="grid grid-cols-2 gap-3">
                <SizingField
                  label="Wing area"
                  value={flight.wingAreaDm2}
                  unit="dm²"
                  min={0.1}
                  max={1000}
                  step={0.1}
                  onChange={(wingAreaDm2) => patch({ wingAreaDm2 })}
                />
                <SizingField
                  label="Assumed maximum lift coefficient"
                  value={flight.clMax}
                  unit="CLmax"
                  min={0.1}
                  max={5}
                  step={0.05}
                  onChange={(clMax) => patch({ clMax })}
                />
                <SizingField
                  label="Air density"
                  value={flight.airDensity}
                  unit="kg/m³"
                  min={0.05}
                  max={2}
                  step={0.005}
                  onChange={(airDensity) => patch({ airDensity })}
                />
              </div>
              <p className="mt-3 text-xs text-dust">
                CLmax is an input assumption, not an airfoil prediction. Use data for the actual
                airfoil, Reynolds number, surface and configuration.
              </p>
            </SizingSection>
            <div className="grid gap-3">
              <SizingMetric label="Wing loading" value={f(result.wingLoadingGdm2)} unit="g/dm²" />
              <SizingMetric
                label="Stall-speed estimate"
                value={f(result.stallSpeedMs, 2)}
                unit="m/s"
                help="Steady, level, 1 g estimate with the entered CLmax"
              />
            </div>
          </div>
          <p className="rounded-lg border border-line p-4 text-sm text-dust">
            Wing loading = mass / area. Vₛ = √[2mg / (ρ S CLmax)], with grams converted to kg and
            dm² converted to m². This omits aerodynamic stability, control authority, structural
            loads, maneuvers and launch behavior.
          </p>
        </Tabs.Content>
      </Tabs.Root>
      {result.notices.length > 0 && (
        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="size-4 text-cyan" aria-hidden />
            Input review
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-dust">
            {result.notices.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={record}>
          <Save className="size-4" aria-hidden />
          Save calculation to notebook
        </Button>
        <Button onClick={exportSizing}>
          <Download className="size-4" aria-hidden />
          Export sizing CSV
        </Button>
      </div>
      <p role="status" className="text-sm text-cyan">
        {notice}
      </p>
    </div>
  );
}
