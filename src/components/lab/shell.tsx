import { useEffect, useState } from "react";
import { UserButton } from "@/lib/auth/gates";
import {
  cloudStatus,
  flushCloudSave,
  hasUnsavedChanges,
  readLegacyWorkspace,
} from "@/lib/engineering/project-storage";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  CircleHelp,
  CircuitBoard,
  Code2,
  Download,
  FolderOpen,
  History,
  Layers3,
  NotebookPen,
  Target,
  ScanLine,
  Plane,
  Wrench,
  Upload,
  Printer,
  Save,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Workflow,
  X,
} from "lucide-react";
import {
  useActiveDesign,
  useBenchPlan,
  useLab,
  type Bench,
  type BoardView,
  type ProjectSnapshot,
  captureProject,
} from "@/lib/lab-store";
import { parseProjectFile, projectFile } from "@/lib/engineering/project-file";
import { CHASSIS, chassisById } from "@/lib/robots/chassis";
import { mcuName } from "@/lib/wire/catalog";
import { Button } from "@/components/ui/button";
import { CodeBench } from "./code-bench";
import { DesignBench } from "./design-bench";
import { FrameBench } from "./frame-bench";
import { BoardBench } from "./board-bench";
import { PrintBench } from "./print-bench";
import { WireBench } from "./wire-bench";
import { MissionBench } from "@/components/engineering/mission-bench";
import { LegBench } from "@/components/engineering/leg-bench";
import { FlightBench } from "@/components/engineering/flight-bench";
import { MechanicalBench } from "@/components/engineering/mechanical-bench";
import { NotebookBench } from "@/components/engineering/notebook-bench";

const WORKSPACES: {
  id: string;
  bench: Bench;
  view?: BoardView;
  label: string;
  icon: typeof Box;
  description: string;
  group: string;
}[] = [
  {
    id: "mission",
    bench: "mission",
    label: "Mission & requirements",
    icon: Target,
    description:
      "Define the mission, engineering limits, and evidence needed to verify your design.",
    group: "Engineering",
  },
  {
    id: "leg",
    bench: "leg",
    label: "Legs & gait",
    icon: ScanLine,
    description:
      "Design articulated legs, inspect reachable targets, and evaluate gait support and static loads.",
    group: "Engineering",
  },
  {
    id: "flight",
    bench: "flight",
    label: "Flight sizing",
    icon: Plane,
    description:
      "Build a mass and cost budget, locate the center of mass, and evaluate flight sizing assumptions.",
    group: "Engineering",
  },
  {
    id: "mechanical",
    bench: "mechanical",
    label: "Mechanical assembly",
    icon: Wrench,
    description:
      "Develop mounting geometry, review fit and fasteners, and export printable and CAD reference files.",
    group: "Engineering",
  },
  {
    id: "notebook",
    bench: "notebook",
    label: "Experiment notebook",
    icon: NotebookPen,
    description:
      "Capture decisions, measurements, and revisions. Compare predictions with tests and export a report.",
    group: "Engineering",
  },
  {
    id: "design",
    bench: "design",
    label: "Overview & AI",
    icon: Sparkles,
    description: "Describe your idea, refine the project, and choose your next step.",
    group: "Design",
  },
  {
    id: "wire",
    bench: "wire",
    label: "Components",
    icon: Layers3,
    description:
      "Choose the controller and parts. Pin assignments and wiring checks update together.",
    group: "Design",
  },
  {
    id: "schematic",
    bench: "board",
    view: "schematic",
    label: "Schematic",
    icon: Workflow,
    description: "Follow connections and inspect individual nets in the generated circuit diagram.",
    group: "Design",
  },
  {
    id: "board",
    bench: "board",
    view: "board",
    label: "PCB layout",
    icon: CircuitBoard,
    description:
      "Explore the conceptual breakout layout, review checks, and export reference files.",
    group: "Design",
  },
  {
    id: "frame",
    bench: "frame",
    label: "3D assembly",
    icon: Box,
    description: "Inspect the machine, adjust its scale, and try its movement in the test bay.",
    group: "Build & test",
  },
  {
    id: "print",
    bench: "print",
    label: "Printable parts",
    icon: Printer,
    description: "Adjust part dimensions and export an STL for your slicer.",
    group: "Build & test",
  },
  {
    id: "code",
    bench: "code",
    label: "Firmware",
    icon: Code2,
    description: "Review a starter sketch with the same pin assignments as your wiring plan.",
    group: "Build & test",
  },
];

function exportSnapshot(snapshot: ProjectSnapshot) {
  const url = URL.createObjectURL(new Blob([projectFile(snapshot)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${snapshot.state.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "project"}-backup.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Lab() {
  const bench = useLab((s) => s.bench);
  const boardView = useLab((s) => s.boardView);
  const chassis = useLab((s) => s.chassis);
  const projectName = useLab((s) => s.projectName);
  const projectRevision = useLab((s) => s.projectRevision);
  const mcu = useLab((s) => s.mcu);
  const picked = useLab((s) => s.picked);
  const snapshots = useLab((s) => s.snapshots);
  const projects = useLab((s) => s.projects);
  const saveProject = useLab((s) => s.saveProject);
  const openProject = useLab((s) => s.openProject);
  const importProject = useLab((s) => s.importProject);
  const setBench = useLab((s) => s.setBench);
  const setBoardView = useLab((s) => s.setBoardView);
  const setProjectName = useLab((s) => s.setProjectName);
  const setChassis = useLab((s) => s.setChassis);
  const saveSnapshot = useLab((s) => s.saveSnapshot);
  const restoreSnapshot = useLab((s) => s.restoreSnapshot);
  const activeDesign = useActiveDesign();
  const plan = useBenchPlan();
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [help, setHelp] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [cloud, setCloud] = useState(cloudStatus);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const faults = plan.issues.filter((i) => i.level === "fault").length;
  const cautions = plan.issues.filter((i) => i.level === "caution").length;
  const partCount = Object.values(picked).reduce<number>((sum, n) => sum + (n ?? 0), 1);
  const current =
    WORKSPACES.find((w) => w.bench === bench && (!w.view || w.view === boardView)) ??
    WORKSPACES[0]!;

  useEffect(() => {
    const status = (event: Event) => setCloud((event as CustomEvent<string>).detail);
    const leaving = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("noah-forge-cloud-status", status);
    window.addEventListener("beforeunload", leaving);
    void Promise.resolve(useLab.persist.rehydrate())
      .then(() => {
        if (!useLab.persist.hasHydrated()) throw new Error("Unable to load cloud workspace.");
        setReady(true);
      })
      .catch(() => setLoadError(true));
    return () => {
      window.removeEventListener("noah-forge-cloud-status", status);
      window.removeEventListener("beforeunload", leaving);
    };
  }, []);
  useEffect(() => {
    const storageIssue = (event: Event) => setNotice((event as CustomEvent<string>).detail);
    window.addEventListener("noah-forge-storage-error", storageIssue);
    return () => window.removeEventListener("noah-forge-storage-error", storageIssue);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const navigate = (item: (typeof WORKSPACES)[number]) => {
    if (item.view) setBoardView(item.view);
    setBench(item.bench);
  };

  if (!ready)
    return (
      <main className="p-8" role="status">
        <p>
          {loadError
            ? "Could not load your cloud workspace. Your saved data has not been changed."
            : "Loading your cloud workspace…"}
        </p>
        {loadError && <Button onClick={() => window.location.reload()}>Retry loading</Button>}
        <UserButton />
      </main>
    );

  const confirmSave = async (message: string) => {
    try {
      await flushCloudSave();
      setNotice(message);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Cloud save failed.");
    }
  };

  return (
    <div className="forge-app">
      <a href="#workspace" className="skip-link">
        Skip to workspace
      </a>
      <header className="forge-header">
        <button
          className="forge-brand"
          onClick={() => setBench("design")}
          aria-label="Noah Forge overview"
        >
          <img
            src="/precision-noah-forge.png"
            alt="Precision Noah Forge emblem"
            width={64}
            height={64}
            className="precision-logo"
          />
          <span>
            Noah Forge<span className="brand-caption">Robotics engineering studio</span>
          </span>
        </button>
        <div className="project-heading">
          <label htmlFor="project-name" className="sr-only">
            Project name
          </label>
          <input
            id="project-name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            maxLength={48}
            placeholder="Untitled project"
          />
          <span className="project-meta">
            {activeDesign?.name ?? chassisById(chassis).name} <span aria-hidden>·</span>{" "}
            <span role="status">{cloud}</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <UserButton />
          {cloud.startsWith("Not saved") && (
            <Button onClick={() => void confirmSave("Saved to cloud.")}>Retry save</Button>
          )}
          <Button
            onClick={() => {
              saveSnapshot();
              void confirmSave("Restore point saved to cloud.");
            }}
            aria-label="Save restore point"
          >
            <Save className="size-4" aria-hidden />
            <span className="hidden sm:inline">Save point</span>
          </Button>
          <Button onClick={() => setProjectsOpen(true)}>
            <FolderOpen className="size-4" aria-hidden />
            <span>Projects</span>
            <ChevronDown className="hidden size-3 sm:block" aria-hidden />
          </Button>
        </div>
      </header>
      <div className="forge-layout">
        <aside className="forge-sidebar">
          <nav aria-label="Project workspaces" className="workspace-nav">
            {["Engineering", "Design", "Build & test"].map((group) => (
              <div className="nav-group" key={group}>
                <p className="nav-group-label">{group}</p>
                {WORKSPACES.filter((w) => w.group === group).map((item) => {
                  const Icon = item.icon;
                  const on = current.id === item.id;
                  return (
                    <button
                      key={item.id}
                      aria-current={on ? "page" : undefined}
                      onClick={() => navigate(item)}
                      className={`workspace-link ${on ? "is-active" : ""}`}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span>{item.label}</span>
                      {item.id === "wire" && faults > 0 && (
                        <span className="nav-count">{faults}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sidebar-summary">
            <p className="text-xs font-medium text-dust">PROJECT AT A GLANCE</p>
            <p className="mt-3 text-sm font-medium">{mcuName(mcu)}</p>
            <p className="mt-1 text-xs text-dust">
              {partCount} components · {plan.pins.length} assigned pins
            </p>
            <button className="check-link" onClick={() => setBench("wire")}>
              {faults ? (
                <TriangleAlert className="size-4 text-magenta" aria-hidden />
              ) : (
                <ShieldCheck className="size-4 text-mint" aria-hidden />
              )}
              <span>
                {faults ? `${faults} wiring fault${faults === 1 ? "" : "s"}` : "No wiring faults"}
                {cautions > 0 && ` · ${cautions} caution${cautions === 1 ? "" : "s"}`}
              </span>
              <ArrowRight className="size-3 shrink-0" aria-hidden />
            </button>
            <button
              className="mt-4 flex min-h-11 items-center gap-2 text-sm text-dust hover:text-paper"
              onClick={() => setHelp((v) => !v)}
              aria-expanded={help}
            >
              <CircleHelp className="size-4" aria-hidden />
              Workflow guide
            </button>
          </div>
        </aside>
        <main id="workspace" className="forge-workspace" tabIndex={-1}>
          <label className="mb-4 block text-xs font-medium text-dust lg:hidden">
            Workspace
            <select
              aria-label="Choose workspace"
              value={current.id}
              onChange={(event) => {
                const selected = WORKSPACES.find((item) => item.id === event.target.value);
                if (selected) navigate(selected);
              }}
              className="mt-1 min-h-11 w-full rounded-md border border-line bg-panel px-3 text-sm text-paper"
            >
              {["Engineering", "Design", "Build & test"].map((group) => (
                <optgroup key={group} label={group}>
                  {WORKSPACES.filter((item) => item.group === group).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="workspace-heading">
            <div className="min-w-0">
              <p className="workspace-eyebrow">PROJECT / {current.group.toUpperCase()}</p>
              <h1>{current.label}</h1>
              <p className="workspace-description">{current.description}</p>
            </div>
            {bench !== "design" && (
              <Button variant="ghost" onClick={() => setBench("design")}>
                <Sparkles className="size-4" aria-hidden />
                Ask AI
              </Button>
            )}
          </div>
          {help && (
            <section className="workflow-guide">
              <h2 className="font-medium">From idea to prototype</h2>
              <p className="mt-1 text-sm text-dust">
                Define your mission and requirements. Develop legs, flight sizing, and mounting
                geometry; choose electronics and review the schematic. Record predicted and measured
                results in the notebook, then export a report and project file. All original tools
                remain available.
              </p>
              <p className="mt-2 text-xs text-dust">
                Board exports are SVG references and a CSV parts list. Manufacturing files and
                circuit simulation are not available.
              </p>
              <Button variant="ghost" className="mt-2" onClick={() => setHelp(false)}>
                Got it
              </Button>
            </section>
          )}
          <div hidden={bench !== "design"}>
            <DesignBench />
          </div>
          {bench === "frame" && <FrameBench />}
          {bench === "print" && <PrintBench />}
          {bench === "wire" && <WireBench />}
          {bench === "board" && <BoardBench />}
          {bench === "code" && <CodeBench />}
          {bench === "mission" && <MissionBench key={projectRevision} />}
          {bench === "leg" && <LegBench key={projectRevision} />}
          {bench === "flight" && <FlightBench key={projectRevision} />}
          {bench === "mechanical" && <MechanicalBench key={projectRevision} />}
          {bench === "notebook" && <NotebookBench key={projectRevision} />}
          <footer className="workspace-footer">
            Prototype workspace. Review the wiring, part specifications, and firmware before
            powering hardware. Keep propellers off during bench tests.
          </footer>
        </main>
      </div>
      <Dialog.Root open={projectsOpen} onOpenChange={setProjectsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="project-dialog">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-xl font-semibold">Projects & templates</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-dust">
                  Switch to a starter or return to a saved restore point. Your current setup is
                  backed up automatically before switching.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" aria-label="Close projects">
                  <X className="size-5" aria-hidden />
                </Button>
              </Dialog.Close>
            </div>
            <section
              className="mt-6 rounded-xl border border-line p-4"
              aria-label="Portable projects"
            >
              <h2 className="text-sm font-semibold">Your engineering projects</h2>
              <p className="mt-1 text-xs text-dust">
                Save up to 30 named projects here. Project files include the active machine,
                electronics, printable dimensions, requirements, calculations, and notebook.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    saveProject();
                    void confirmSave("Named project saved to cloud.");
                  }}
                >
                  <Save className="size-4" aria-hidden />
                  Save named project
                </Button>
                <Button onClick={() => exportSnapshot(captureProject())}>
                  <Download className="size-4" aria-hidden />
                  Export project
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      const legacy = await readLegacyWorkspace();
                      if (!legacy)
                        throw new Error("No previous browser projects found on this device.");
                      const state = JSON.parse(legacy).state;
                      const saved = [...(state.projects || []), ...(state.snapshots || [])];
                      const active = {
                        id: state.projectId || "legacy",
                        savedAt: Date.now(),
                        state,
                        design:
                          state.customs?.find((d: { id: string }) => d.id === state.customId) ??
                          null,
                      };
                      const valid = [...saved, active].map((p) =>
                        parseProjectFile(JSON.stringify({ version: 2, ...p })),
                      );
                      for (const project of valid) importProject(project);
                      await confirmSave("Previous browser projects imported and saved to cloud.");
                    } catch (error) {
                      setProjectError(error instanceof Error ? error.message : "Import failed.");
                    }
                  }}
                >
                  Import previous browser saves
                </Button>
                <label
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-line px-3 text-sm font-medium"
                  htmlFor="import-project"
                >
                  <Upload className="size-4" aria-hidden />
                  Import project
                </label>
                <input
                  id="import-project"
                  className="sr-only"
                  type="file"
                  accept="application/json,.json"
                  onChange={async (event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (!file) return;
                    try {
                      if (file.size > 4_000_000)
                        throw new Error("Project files must be smaller than 4 MB.");
                      const imported = parseProjectFile(await file.text());
                      importProject(imported);
                      setBench("mission");
                      setProjectsOpen(false);
                      setProjectError("");
                      setNotice("Project imported. Your previous setup was backed up.");
                    } catch (error) {
                      setProjectError(
                        error instanceof Error ? error.message : "Could not import this project.",
                      );
                    }
                  }}
                />
              </div>
              {projectError && (
                <p role="alert" className="mt-3 text-sm text-magenta">
                  {projectError}
                </p>
              )}
              {projects.length === 0 ? (
                <p className="mt-3 text-xs text-dust">
                  Save your first named project to keep a course or personal build separate.
                </p>
              ) : (
                <ul className="mt-3 grid gap-2">
                  {projects.map((saved) => (
                    <li
                      key={saved.state.projectId}
                      className="flex min-w-0 items-center gap-2 border-t border-line pt-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {saved.state.projectName}
                      </span>
                      <Button
                        onClick={() => {
                          openProject(saved.state.projectId);
                          setProjectsOpen(false);
                          setNotice("Named project opened. Previous setup backed up.");
                        }}
                      >
                        Open project
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`Export ${saved.state.projectName}`}
                        onClick={() => exportSnapshot(saved)}
                      >
                        <Download className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <h2 className="mt-6 flex items-center gap-2 text-sm font-semibold">
              <Box className="size-4" aria-hidden />
              Start from a template
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {CHASSIS.map((item) => (
                <button
                  className="template-option"
                  key={item.id}
                  onClick={() => {
                    setChassis(item.id);
                    setBench("design");
                    setProjectsOpen(false);
                    setNotice("Template opened. Previous setup saved as a restore point.");
                  }}
                >
                  <span className="flex items-center justify-between gap-2 font-medium">
                    {item.name}
                    <ArrowRight className="size-4 text-dust" aria-hidden />
                  </span>
                  <span className="mt-1 block text-xs text-dust">{item.blurb}</span>
                </button>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <History className="size-4" aria-hidden />
                Restore points <span className="text-dust">({snapshots.length}/12)</span>
              </h2>
              <Button
                onClick={() => {
                  saveSnapshot();
                  void confirmSave("Restore point saved to cloud.");
                }}
              >
                <Save className="size-4" aria-hidden />
                Save current setup
              </Button>
            </div>
            <p className="mt-1 text-xs text-dust">
              The 12 most recent setups save to your cloud workspace. Export a project for an
              additional backup.
            </p>
            {snapshots.length === 0 ? (
              <p className="mt-3 rounded-md border border-line p-4 text-sm text-dust">
                No restore points yet. Save your current setup to return to it later.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {snapshots.map((saved) => (
                  <li
                    key={saved.id}
                    className="flex min-w-0 items-center gap-2 rounded-md border border-line p-2"
                  >
                    <div className="min-w-0 flex-1 px-2">
                      <p className="truncate text-sm font-medium">
                        {saved.state.projectName || "Untitled project"}
                      </p>
                      <p className="text-xs text-dust">
                        {new Date(saved.savedAt).toLocaleString()} · {mcuName(saved.state.mcu)}
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        restoreSnapshot(saved.id);
                        setProjectsOpen(false);
                        setNotice("Restore point opened. Your previous setup was backed up.");
                      }}
                    >
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => exportSnapshot(saved)}
                      aria-label={`Download backup of ${saved.state.projectName}`}
                    >
                      <Download className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div role="status" aria-live="polite" className={notice ? "save-notice" : "sr-only"}>
        {notice && (
          <>
            <Check className="size-4" aria-hidden />
            {notice}
          </>
        )}
      </div>
    </div>
  );
}
