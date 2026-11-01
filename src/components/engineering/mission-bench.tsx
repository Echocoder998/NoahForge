import { ROBOT_ARCHETYPES, type RobotArchetype } from "@/lib/engineering/types";
import { archetypeLabels } from "@/lib/engineering/archetypes";
import { ProjectEstimates } from "./project-estimates";
import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Plus,
  RotateCcw,
  Target,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab } from "@/lib/lab-store";
import type { Requirement } from "@/lib/engineering/types";
import { requirementStatus } from "@/lib/engineering/report";

const field =
  "min-h-11 w-full rounded-md border border-line bg-hangar px-3 py-2 text-sm text-paper outline-none focus:border-cyan";
const STATUS = {
  unverified: "Unverified",
  "needs-evidence": "Evidence needed",
  met: "Met with evidence",
  "not-met": "Not met",
};
const id = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function MissionBench() {
  const mission = useLab((s) => s.engineering.mission);
  const engineering = useLab((s) => s.engineering);
  const patchEngineering = useLab((s) => s.patchEngineering);
  const setBench = useLab((s) => s.setBench);
  const [removed, setRemoved] = useState<Requirement | null>(null);
  const update = (patch: Partial<typeof mission>) =>
    patchEngineering({ mission: { ...mission, ...patch } });
  const updateRequirement = (requirementId: string, patch: Partial<Requirement>) =>
    update({
      requirements: mission.requirements.map((requirement) =>
        requirement.id === requirementId ? { ...requirement, ...patch } : requirement,
      ),
    });
  const addRequirement = (
    metric = "custom",
    text = "",
    target = 0,
    unit = "",
    direction: "min" | "max" = "max",
  ) =>
    update({
      requirements: [
        ...mission.requirements,
        {
          id: id(),
          text,
          metric,
          target,
          unit,
          direction,
          actual: null,
          method: "test",
          evidence: "",
        },
      ],
    });
  const completed = mission.requirements.filter(
    (requirement) => requirementStatus(requirement) === "met",
  ).length;

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-3">
      <div className="min-w-0 space-y-4 xl:col-span-2">
        <section
          className="rounded-xl border border-line bg-panel p-4 sm:p-6"
          aria-labelledby="mission-brief-heading"
        >
          <h2
            id="mission-brief-heading"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <Target className="size-4 text-cyan" aria-hidden />
            Mission brief
          </h2>
          <p className="mt-1 text-sm text-dust">
            Define what the robot must accomplish and how you will prove it.
          </p>
          <label className="mt-4 block text-sm font-medium">
            Robot archetype
            <select
              aria-label="Robot archetype"
              className={`${field} mt-2`}
              value={engineering.archetype}
              onChange={(e) => patchEngineering({ archetype: e.target.value as RobotArchetype })}
            >
              {ROBOT_ARCHETYPES.map((a) => (
                <option key={a} value={a}>
                  {archetypeLabels[a]}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="mission-summary" className="mt-5 block text-sm font-medium">
            Mission / problem statement
          </label>
          <textarea
            id="mission-summary"
            rows={4}
            maxLength={4000}
            value={mission.summary}
            onChange={(event) => update({ summary: event.target.value })}
            placeholder="Design a six-legged inspection robot that carries a camera across an uneven indoor test course…"
            className={`${field} mt-2 resize-y`}
          />
          <label htmlFor="mission-terrain" className="mt-4 block text-sm font-medium">
            Environment and terrain
          </label>
          <input
            id="mission-terrain"
            maxLength={500}
            value={mission.terrain}
            onChange={(event) => update({ terrain: event.target.value })}
            className={`${field} mt-2`}
          />
          <div className="mt-4 grid gap-x-5 sm:grid-cols-2">
            <NumberInput
              label="Budget limit"
              unit="USD"
              value={mission.budgetUsd}
              onChange={(budgetUsd) => update({ budgetUsd })}
            />
            <NumberInput
              label="Maximum total mass"
              unit="g"
              value={mission.maxMassG}
              onChange={(maxMassG) => update({ maxMassG })}
            />
            <NumberInput
              label="Required payload"
              unit="g"
              value={mission.payloadG}
              onChange={(payloadG) => update({ payloadG })}
            />
            <NumberInput
              label="Target operating time"
              unit="min"
              value={mission.targetRuntimeMin}
              onChange={(targetRuntimeMin) => update({ targetRuntimeMin })}
            />
          </div>
        </section>
        <section
          className="rounded-xl border border-line bg-panel p-4 sm:p-6"
          aria-labelledby="requirements-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="requirements-heading"
                className="flex items-center gap-2 text-base font-semibold"
              >
                <ClipboardList className="size-4 text-cyan" aria-hidden />
                Requirements & verification
              </h2>
              <p className="mt-1 text-sm text-dust">
                {completed} of {mission.requirements.length} requirements met with recorded
                evidence.
              </p>
            </div>
            <Button
              variant="primary"
              disabled={mission.requirements.length >= 60}
              onClick={() => addRequirement()}
            >
              <Plus className="size-4" aria-hidden />
              Add requirement
            </Button>
          </div>
          <p className="mt-3 text-xs text-dust">
            Record actual test or analysis results explicitly. Planning estimates do not fill the
            results for you.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={() =>
                addRequirement("mass", "Total robot mass", mission.maxMassG, "g", "max")
              }
              disabled={mission.requirements.length >= 60}
            >
              Add mass limit
            </Button>
            <Button
              onClick={() =>
                addRequirement("runtime", "Operating time", mission.targetRuntimeMin, "min", "min")
              }
              disabled={mission.requirements.length >= 60}
            >
              Add runtime target
            </Button>
            <Button
              onClick={() =>
                addRequirement("cost", "Component budget", mission.budgetUsd, "USD", "max")
              }
              disabled={mission.requirements.length >= 60}
            >
              Add budget limit
            </Button>
          </div>
          {mission.requirements.length === 0 && (
            <div className="mt-5 rounded-lg border border-line bg-hangar p-5 text-sm text-dust">
              No requirements yet. Add a measurable condition such as maximum mass, minimum
              operating time, or obstacle height.
            </div>
          )}
          <div className="mt-4 grid gap-4">
            {mission.requirements.map((requirement, index) => {
              const state = requirementStatus(requirement);
              return (
                <article
                  key={requirement.id}
                  className="rounded-lg border border-line bg-hangar p-4"
                  aria-label={`Requirement ${index + 1}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`flex items-center gap-2 text-xs font-medium ${state === "met" ? "text-mint" : state === "not-met" ? "text-magenta" : "text-dust"}`}
                    >
                      {state === "met" ? (
                        <CheckCircle2 className="size-4" aria-hidden />
                      ) : (
                        <TriangleAlert className="size-4" aria-hidden />
                      )}
                      R{index + 1} · {STATUS[state]}
                    </p>
                    <Button
                      variant="ghost"
                      aria-label={`Remove requirement ${index + 1}`}
                      onClick={() => {
                        setRemoved(requirement);
                        update({
                          requirements: mission.requirements.filter(
                            (item) => item.id !== requirement.id,
                          ),
                        });
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                  <label className="mt-2 block text-xs text-dust">
                    Requirement description
                    <input
                      value={requirement.text}
                      maxLength={500}
                      onChange={(event) =>
                        updateRequirement(requirement.id, { text: event.target.value })
                      }
                      placeholder="Describe a measurable condition"
                      className={`${field} mt-1`}
                      aria-label={`Requirement ${index + 1} description`}
                    />
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <label className="block text-xs text-dust">
                      Limit
                      <select
                        value={requirement.direction}
                        onChange={(event) =>
                          updateRequirement(requirement.id, {
                            direction: event.target.value as "min" | "max",
                          })
                        }
                        className={`${field} mt-1`}
                        aria-label={`Requirement ${index + 1} limit`}
                      >
                        <option value="max">Maximum (≤)</option>
                        <option value="min">Minimum (≥)</option>
                      </select>
                    </label>
                    <label className="block text-xs text-dust">
                      Target
                      <input
                        type="number"
                        value={requirement.target}
                        step="any"
                        onChange={(event) => {
                          const target = Number(event.target.value);
                          if (Number.isFinite(target))
                            updateRequirement(requirement.id, { target });
                        }}
                        className={`${field} mt-1`}
                        aria-label={`Requirement ${index + 1} target`}
                      />
                    </label>
                    <label className="block text-xs text-dust">
                      Unit
                      <input
                        value={requirement.unit}
                        maxLength={30}
                        onChange={(event) =>
                          updateRequirement(requirement.id, { unit: event.target.value })
                        }
                        className={`${field} mt-1`}
                        aria-label={`Requirement ${index + 1} unit`}
                        placeholder="g, min, mm…"
                      />
                    </label>
                    <label className="block text-xs text-dust">
                      Recorded result
                      <input
                        type="number"
                        value={requirement.actual ?? ""}
                        step="any"
                        onChange={(event) => {
                          const actual =
                            event.target.value === "" ? null : Number(event.target.value);
                          if (actual === null || Number.isFinite(actual))
                            updateRequirement(requirement.id, { actual });
                        }}
                        className={`${field} mt-1`}
                        aria-label={`Requirement ${index + 1} recorded result`}
                        placeholder="Not recorded"
                      />
                    </label>
                  </div>
                  <label className="mt-3 block text-xs text-dust">
                    Verification method
                    <select
                      value={requirement.method}
                      onChange={(event) =>
                        updateRequirement(requirement.id, {
                          method: event.target.value as Requirement["method"],
                        })
                      }
                      className={`${field} mt-1`}
                      aria-label={`Requirement ${index + 1} method`}
                    >
                      <option value="test">Test / measurement</option>
                      <option value="analysis">Analysis</option>
                      <option value="inspection">Inspection</option>
                      <option value="demonstration">Demonstration</option>
                    </select>
                  </label>
                  <label className="mt-3 block text-xs text-dust">
                    Evidence / notebook reference
                    <textarea
                      value={requirement.evidence}
                      rows={2}
                      maxLength={2000}
                      onChange={(event) =>
                        updateRequirement(requirement.id, { evidence: event.target.value })
                      }
                      className={`${field} mt-1 resize-y`}
                      aria-label={`Requirement ${index + 1} evidence`}
                      placeholder="Test date, measurement method, notebook entry, or calculation reference…"
                    />
                  </label>
                </article>
              );
            })}
          </div>
          {removed && (
            <div
              className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3"
              role="status"
            >
              <p className="text-sm text-dust">Requirement removed.</p>
              <Button
                disabled={
                  mission.requirements.length >= 60 ||
                  mission.requirements.some((item) => item.id === removed.id)
                }
                onClick={() => {
                  if (
                    mission.requirements.length >= 60 ||
                    mission.requirements.some((item) => item.id === removed.id)
                  )
                    return;
                  update({ requirements: [...mission.requirements, removed] });
                  setRemoved(null);
                }}
              >
                <RotateCcw className="size-4" aria-hidden />
                Undo remove
              </Button>
            </div>
          )}
        </section>
      </div>
      <aside className="min-w-0 space-y-4">
        <section className="rounded-xl border border-line bg-panel p-4 sm:p-5">
          <h2 className="text-base font-semibold">Planning estimates</h2>
          <p className="mt-1 text-xs text-dust">
            Calculated from this archetype's shared mass, battery and sizing inputs. These are
            separate from recorded verification results.
          </p>
          <div className="mt-4 space-y-4">
            <ProjectEstimates />
          </div>
          <Button className="mt-5 w-full" onClick={() => setBench("calculators")}>
            Review sizing inputs
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </section>
        <section className="rounded-xl border border-line bg-panel p-4 sm:p-5">
          <h2 className="text-sm font-semibold">A useful test plan</h2>
          <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm text-dust">
            <li>Write a measurable target and its unit.</li>
            <li>Choose a test, analysis, inspection, or demonstration.</li>
            <li>Record the conditions, equipment, and result.</li>
            <li>Attach evidence and explain any shortfall.</li>
          </ol>
          <Button className="mt-5 w-full" onClick={() => setBench("notebook")}>
            Open experiment notebook
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </section>
      </aside>
    </div>
  );
}

function NumberInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block border-b border-line py-3 text-sm">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="text-xs text-dust">{unit}</span>
      </span>
      <input
        className={`${field} mt-2 font-mono`}
        type="number"
        min={0}
        max={1_000_000_000}
        step="any"
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next >= 0 && next <= 1_000_000_000) onChange(next);
        }}
        aria-label={label}
      />
    </label>
  );
}
function Estimate({ label, value, over }: { label: string; value: string; over: boolean }) {
  return (
    <div>
      <dt className="text-xs text-dust">{label}</dt>
      <dd className={`mt-1 font-mono text-sm ${over ? "text-magenta" : "text-paper"}`}>{value}</dd>
    </div>
  );
}
