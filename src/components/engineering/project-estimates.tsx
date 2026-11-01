import { useLab } from "@/lib/lab-store";
import { analyzeProject, safetyNotice } from "@/lib/engineering/archetypes";
export function ProjectEstimates({ compact = false }: { compact?: boolean }) {
  const project = useLab((s) => s.engineering);
  const r = analyzeProject(project);
  return (
    <div className={compact ? "mt-3 space-y-2 text-xs" : "space-y-3"}>
      {r.metrics.map(([label, value, target, unit]) => (
        <div key={label}>
          <p className="text-dust">{label}</p>
          <p
            className={
              value === null || (label.includes("target") ? value < target : value > target)
                ? "font-mono text-magenta"
                : "font-mono"
            }
          >
            {value === null ? "Undefined" : value.toFixed(1)} / {target.toFixed(1)} {unit}
          </p>
        </div>
      ))}
      {project.archetype === "rover" && <p>Drive power draw: {r.drivePowerW.toFixed(1)} W</p>}
      {!compact && <p className="text-sm text-dust">{safetyNotice(project.archetype)}</p>}
    </div>
  );
}
