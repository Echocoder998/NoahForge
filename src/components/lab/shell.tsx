import { useEffect, useState } from "react";
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
} from "@/lib/lab-store";
import { CHASSIS, chassisById } from "@/lib/robots/chassis";
import { mcuName } from "@/lib/wire/catalog";
import { Button } from "@/components/ui/button";
import { CodeBench } from "./code-bench";
import { DesignBench } from "./design-bench";
import { FrameBench } from "./frame-bench";
import { BoardBench } from "./board-bench";
import { PrintBench } from "./print-bench";
import { WireBench } from "./wire-bench";

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
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ version: 1, ...snapshot }, null, 2)], { type: "application/json" }),
  );
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
  const mcu = useLab((s) => s.mcu);
  const picked = useLab((s) => s.picked);
  const snapshots = useLab((s) => s.snapshots);
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
  const faults = plan.issues.filter((i) => i.level === "fault").length;
  const cautions = plan.issues.filter((i) => i.level === "caution").length;
  const partCount = Object.values(picked).reduce<number>((sum, n) => sum + (n ?? 0), 1);
  const current =
    WORKSPACES.find((w) => w.bench === bench && (!w.view || w.view === boardView)) ??
    WORKSPACES[0]!;

  useEffect(() => {
    void useLab.persist.rehydrate();
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
          <img src="/logo-mark.png" alt="" width={36} height={36} className="size-9 rounded-md" />
          <span>
            Noah Forge<span className="brand-caption">Hardware workspace</span>
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
            {activeDesign?.name ?? chassisById(chassis).name} <span aria-hidden>·</span> Saved in
            this browser
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            onClick={() => {
              saveSnapshot();
              setNotice("Restore point saved in this browser.");
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
            {["Design", "Build & test"].map((group) => (
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
                Start with a template or describe an idea. Choose components, follow the schematic,
                then review the layout and checks. Use the assembly, printable parts, and firmware
                tools when you are ready to prototype.
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
                  setNotice("Restore point saved in this browser.");
                }}
              >
                <Save className="size-4" aria-hidden />
                Save current setup
              </Button>
            </div>
            <p className="mt-1 text-xs text-dust">
              The 12 most recent setups stay in this browser. Download a backup for a copy outside
              the browser.
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
