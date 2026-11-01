import { analyzeProject, archetypeLabels, isWalking } from "./archetypes";
import type { EngineeringProject, NotebookEntry, Requirement } from "./types";

export type RequirementStatus = "unverified" | "needs-evidence" | "met" | "not-met";
export function requirementStatus(requirement: Requirement): RequirementStatus {
  if (
    requirement.actual === null ||
    !Number.isFinite(requirement.actual) ||
    !Number.isFinite(requirement.target)
  )
    return "unverified";
  const met =
    requirement.direction === "min"
      ? requirement.actual >= requirement.target
      : requirement.actual <= requirement.target;
  if (!met) return "not-met";
  return requirement.evidence.trim() ? "met" : "needs-evidence";
}

export function measurementDelta(
  entry: Pick<NotebookEntry, "predicted" | "measured">,
): { difference: number; percent: number | null } | null {
  if (
    entry.predicted === null ||
    entry.measured === null ||
    !Number.isFinite(entry.predicted) ||
    !Number.isFinite(entry.measured)
  )
    return null;
  const difference = entry.measured - entry.predicted;
  return {
    difference,
    percent: entry.predicted === 0 ? null : (difference / Math.abs(entry.predicted)) * 100,
  };
}

export const MAX_PHOTO_BYTES = 350_000;
export const MAX_NOTEBOOK_PHOTO_CHARS = 2_000_000;
export function safePhoto(dataUrl: string): boolean {
  if (typeof dataUrl !== "string" || dataUrl.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 80)
    return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return false;
  try {
    const bytes = atob(match[2]!.slice(0, 24));
    if (match[1] === "png") return bytes.startsWith("\x89PNG\r\n\x1a\n");
    if (match[1] === "jpeg") return bytes.startsWith("\xff\xd8\xff");
    return bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP";
  } catch {
    return false;
  }
}

const html = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
const markdown = (value: unknown) => html(value).replace(/([\\`*_\[\]#])/g, "\\$1");
const cell = (value: unknown) =>
  markdown(value)
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ");
const number = (value: number | null, digits = 2) =>
  value === null || !Number.isFinite(value)
    ? "Not recorded"
    : Number(value.toFixed(digits)).toString();
const status = (requirement: Requirement) =>
  ({
    unverified: "Unverified",
    "needs-evidence": "Comparison met; evidence needed",
    met: "Met with recorded evidence",
    "not-met": "Not met",
  })[requirementStatus(requirement)];

function calculations(project: EngineeringProject): [string, string, string][] {
  const r = analyzeProject(project);
  return [
    ["Archetype", archetypeLabels[project.archetype], "Selected in the Mission brief"],
    ...r.metrics.map(([label, value, target, unit]): [string, string, string] => [
      label,
      `${value === null ? "Undefined" : number(value)} / ${number(target)} ${unit}`,
      "Planning estimate / mission limit or target",
    ]),
    ...((isWalking(project.archetype)
      ? [
          [
            "Joint stall torque",
            `${number(r.jointTorqueNcm)} N cm`,
            "Weight / supporting legs x maximum reach x service factor",
          ],
          [
            "Servo bus continuous / peak",
            `${number(r.busContinuousA)} / ${number(r.busPeakA)} A`,
            "Actuator count x entered per-actuator currents + electronics",
          ],
          ["Stride gait speed", `${number(r.strideSpeedMs)} m/s`, "Stride length / cycle period"],
        ]
      : project.archetype === "rover"
        ? [
            [
              "Required wheel torque",
              `${number(r.wheelTorqueNcm)} N cm`,
              "Incline + rolling force x wheel radius / driven wheel count x service factor",
            ],
            [
              "Required motor torque",
              `${number(r.motorTorqueNcm)} N cm`,
              "Wheel torque / gear ratio / efficiency",
            ],
            [
              "Incline drive power",
              `${number(r.drivePowerW)} W`,
              "Mechanical drive power / efficiency + idle losses",
            ],
          ]
        : project.archetype === "multirotor"
          ? [
              [
                "Thrust-to-weight",
                number(r.thrustToWeight),
                "Combined static thrust / mass; target at least 2:1",
              ],
            ]
          : [["Stall speed", `${number(r.stallSpeedMs)} m/s`, "sqrt(2 W / rho S CLmax)"]]) as [
      string,
      string,
      string,
    ][]),
    ["Electrical power", `${number(r.powerW)} W`, "Archetype-specific load model"],
    ...r.notices.map((notice): [string, string, string] => [
      "Engineering check",
      notice,
      "Verify with measured data",
    ]),
  ];
}

export function reportMarkdown(
  projectName: string,
  project: EngineeringProject,
  notes: string,
  createdAt = new Date(),
): string {
  const mission = project.mission;
  const lines = [
    `# ${markdown(projectName || "Untitled project")} — engineering report`,
    "",
    `Generated: ${createdAt.toISOString()}`,
    "",
    "## Mission brief",
    "",
    markdown(mission.summary || "No mission summary recorded."),
    "",
    `- Test environment: ${markdown(mission.terrain)}`,
    `- Budget limit: $${number(mission.budgetUsd)}`,
    `- Maximum mass: ${number(mission.maxMassG)} g`,
    `- Required payload: ${number(mission.payloadG)} g`,
    `- Target runtime: ${number(mission.targetRuntimeMin)} min`,
    "",
    "## Requirements and verification",
    "",
    "| Requirement | Target | Recorded result | Method | Status | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...mission.requirements.map(
      (requirement) =>
        `| ${cell(requirement.text)} | ${requirement.direction === "min" ? "≥" : "≤"} ${number(requirement.target)} ${cell(requirement.unit)} | ${number(requirement.actual)} ${cell(requirement.unit)} | ${cell(requirement.method)} | ${status(requirement)} | ${cell(requirement.evidence || "No evidence recorded")} |`,
    ),
    ...(mission.requirements.length
      ? []
      : ["| No requirements recorded | — | — | — | Unverified | — |"]),
    "",
    "## Calculation record",
    "",
    "These are analytical estimates from entered inputs. They are not measured results or a validated dynamic simulation.",
    "",
    "| Quantity | Estimate | Formula and assumptions |",
    "| --- | --- | --- |",
    ...calculations(project).map((row) => `| ${row.map(cell).join(" | ")} |`),
    "",
    `Motor / propeller thrust source: ${markdown(project.flight.thrustSource || "Not supplied; replace example values before using the estimates.")}`,
    "",
    "## Mass, position and cost inputs",
    "",
    "| Component | Mass (g) | X / Y / Z (mm) | Cost (USD) | Source |",
    "| --- | --- | --- | --- | --- |",
    ...project.flight.massItems.map(
      (item) =>
        `| ${cell(item.name)} | ${number(item.massG)} | ${number(item.xMm)} / ${number(item.yMm)} / ${number(item.zMm)} | ${number(item.costUsd)} | ${cell(item.source)} |`,
    ),
    "",
    "## Leg and assembly inputs",
    "",
    `- Leg links: coxa ${number(project.leg.coxaMm)} mm, upper ${number(project.leg.upperMm)} mm, lower ${number(project.leg.lowerMm)} mm; ${project.leg.joints} joints per leg.`,
    `- Foot target: ${number(project.leg.targetXmm)}, ${number(project.leg.targetYmm)}, ${number(project.leg.targetZmm)} mm.`,
    `- Gait: ${project.leg.gait}; ${project.leg.legCount} legs; cycle ${number(project.leg.cycleSeconds)} s; stance fraction ${number(project.leg.dutyFactor)}.`,
    `- Static load assumptions: body ${number(project.leg.bodyMassG)} g; payload ${number(project.leg.payloadG)} g; service factor ${number(project.leg.serviceFactor)}.`,
    `- Entered actuator torque: ${number(project.leg.servoTorqueNm)} N·m at ${number(project.leg.servoVoltageV)} V; source: ${markdown(project.leg.servoSource || "Not supplied")}.`,
    `- Mounting plate: ${number(project.assembly.plateWidthMm)} × ${number(project.assembly.plateLengthMm)} × ${number(project.assembly.plateThicknessMm)} mm; ${project.assembly.fastenerSize} fasteners; ${project.assembly.material}; ${project.assembly.orientation} orientation.`,
    "",
    "## Experiment notebook",
    "",
    ...(project.notebook.length
      ? project.notebook.flatMap((entry) => {
          const delta = measurementDelta(entry);
          return [
            `### ${markdown(entry.title || "Untitled entry")}`,
            "",
            `${markdown(entry.date)} · ${entry.kind}`,
            "",
            "**Procedure / decision**",
            "",
            markdown(entry.procedure || "No procedure recorded."),
            "",
            `Predicted: ${number(entry.predicted)} ${markdown(entry.unit)}; measured: ${number(entry.measured)} ${markdown(entry.unit)}.`,
            ...(delta
              ? [
                  `Difference (measured − predicted): ${number(delta.difference)} ${markdown(entry.unit)}${delta.percent === null ? "; percentage undefined when prediction is zero." : ` (${number(delta.percent)}%).`}`,
                ]
              : []),
            "",
            markdown(entry.notes || "No notes recorded."),
            "",
            ...entry.photos
              .filter((photo) => safePhoto(photo.dataUrl))
              .map((photo) => `![${cell(photo.name)}](${photo.dataUrl})`),
            "",
          ];
        })
      : ["No notebook entries recorded.", ""]),
    "## Project notes",
    "",
    markdown(notes || "No additional project notes."),
    "",
    "## Model boundaries",
    "",
    "Kinematics and static checks do not establish dynamic stability. Flight estimates depend on sourced hardware data and experimental confirmation. Conceptual schematic/PCB SVGs are not fabrication files. Review component specifications, manufacturing details and firmware before building.",
    "",
  ];
  return lines.join("\n");
}

export function reportHtml(
  projectName: string,
  project: EngineeringProject,
  notes: string,
  createdAt = new Date(),
): string {
  const rows = project.mission.requirements
    .map(
      (requirement) =>
        `<tr><td>${html(requirement.text)}</td><td>${requirement.direction === "min" ? "≥" : "≤"} ${number(requirement.target)} ${html(requirement.unit)}</td><td>${number(requirement.actual)} ${html(requirement.unit)}</td><td>${html(requirement.method)}</td><td>${html(status(requirement))}</td><td>${html(requirement.evidence || "No evidence recorded")}</td></tr>`,
    )
    .join("");
  const entries = project.notebook
    .map((entry) => {
      const delta = measurementDelta(entry);
      return `<article><h3>${html(entry.title || "Untitled entry")}</h3><p class="meta">${html(entry.date)} · ${entry.kind}</p><h4>Procedure / decision</h4><p class="preserve">${html(entry.procedure || "No procedure recorded.")}</p><p>Predicted: <strong>${number(entry.predicted)} ${html(entry.unit)}</strong>; measured: <strong>${number(entry.measured)} ${html(entry.unit)}</strong>.</p>${delta ? `<p>Measured − predicted: ${number(delta.difference)} ${html(entry.unit)}${delta.percent === null ? "; percentage undefined at zero prediction" : ` (${number(delta.percent)}%)`}.</p>` : ""}<p class="preserve">${html(entry.notes)}</p><div class="photos">${entry.photos
        .filter((photo) => safePhoto(photo.dataUrl))
        .map(
          (photo) =>
            `<figure><img src="${photo.dataUrl}" alt="${html(photo.name)}"/><figcaption>${html(photo.name)}</figcaption></figure>`,
        )
        .join("")}</div></article>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${html(projectName)} — engineering report</title><style>body{font:15px/1.6 Arial,sans-serif;max-width:1000px;margin:40px auto;padding:0 24px;color:#181818;background:#fff}h1,h2{color:#61162D}h1{line-height:1.2}h2{border-bottom:2px solid #61162D;padding-bottom:8px;margin-top:32px}table{border-collapse:collapse;width:100%;font-size:13px;overflow-wrap:anywhere}th,td{border:1px solid #d8d3d4;padding:9px;text-align:left;vertical-align:top}th{background:#f6f0f2}.meta{color:#666}.preserve{white-space:pre-wrap;overflow-wrap:anywhere}article{margin:24px 0;padding:16px;border:1px solid #ddd;break-inside:avoid}.photos{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;max-width:300px}img{max-width:100%;max-height:260px}figcaption{font-size:12px;color:#666}button{padding:10px 16px;background:#61162D;color:white;border:0;border-radius:6px;cursor:pointer}@media print{body{margin:0;max-width:none;font-size:11pt}button{display:none}thead{display:table-header-group}h2{break-after:avoid}}</style></head><body><button onclick="window.print()">Print / save PDF</button><h1>${html(projectName || "Untitled project")}</h1><p class="meta">Noah Forge engineering report · ${html(createdAt.toISOString())}</p><h2>Mission brief</h2><p class="preserve">${html(project.mission.summary || "No mission summary recorded.")}</p><p>Environment: ${html(project.mission.terrain)}<br/>Budget: $${number(project.mission.budgetUsd)} · Mass limit: ${number(project.mission.maxMassG)} g · Payload: ${number(project.mission.payloadG)} g · Runtime target: ${number(project.mission.targetRuntimeMin)} min</p><h2>Requirements and verification</h2><table><thead><tr><th>Requirement</th><th>Target</th><th>Recorded result</th><th>Method</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No requirements recorded.</td></tr>'}</tbody></table><h2>Calculation record</h2><p>Analytical estimates from entered inputs. Values are not measured results or a validated dynamic simulation.</p><table><thead><tr><th>Quantity</th><th>Estimate</th><th>Formula and assumptions</th></tr></thead><tbody>${calculations(
    project,
  )
    .map((row) => `<tr>${row.map((value) => `<td>${html(value)}</td>`).join("")}</tr>`)
    .join(
      "",
    )}</tbody></table><p>Motor / propeller source: ${html(project.flight.thrustSource || "Not supplied; replace planning inputs before using these estimates.")}</p><h2>Mass and cost inputs</h2><table><thead><tr><th>Component</th><th>Mass (g)</th><th>X / Y / Z (mm)</th><th>Cost ($)</th><th>Source</th></tr></thead><tbody>${project.flight.massItems.map((item) => `<tr><td>${html(item.name)}</td><td>${number(item.massG)}</td><td>${number(item.xMm)} / ${number(item.yMm)} / ${number(item.zMm)}</td><td>${number(item.costUsd)}</td><td>${html(item.source)}</td></tr>`).join("")}</tbody></table><h2>Leg and assembly inputs</h2><p>${project.leg.legCount} legs · ${project.leg.joints} joints per leg · links ${number(project.leg.coxaMm)} / ${number(project.leg.upperMm)} / ${number(project.leg.lowerMm)} mm · ${project.leg.gait} gait · ${number(project.leg.cycleSeconds)} s cycle · stance fraction ${number(project.leg.dutyFactor)}.</p><p>Foot target X/Y/Z: ${number(project.leg.targetXmm)} / ${number(project.leg.targetYmm)} / ${number(project.leg.targetZmm)} mm. Static body/payload assumptions: ${number(project.leg.bodyMassG)} / ${number(project.leg.payloadG)} g; service factor ${number(project.leg.serviceFactor)}. Entered actuator torque ${number(project.leg.servoTorqueNm)} N·m at ${number(project.leg.servoVoltageV)} V; source: ${html(project.leg.servoSource || "Not supplied")}.</p><p>Plate: ${number(project.assembly.plateWidthMm)} × ${number(project.assembly.plateLengthMm)} × ${number(project.assembly.plateThicknessMm)} mm; holes ${number(project.assembly.holeDiameterMm)} mm; pitch ${number(project.assembly.holePitchXmm)} × ${number(project.assembly.holePitchYmm)} mm; ${project.assembly.fastenerSize}; ${project.assembly.material}; ${project.assembly.orientation}.</p><h2>Experiment notebook</h2>${entries || "<p>No notebook entries recorded.</p>"}<h2>Project notes</h2><p class="preserve">${html(notes || "No additional project notes.")}</p><h2>Model boundaries</h2><p>Kinematics and static checks do not establish dynamic stability. Flight estimates depend on sourced hardware data and experimental confirmation. Conceptual schematic/PCB SVGs are not fabrication files. Review component specifications, manufacturing details and firmware before building.</p></body></html>`;
}
