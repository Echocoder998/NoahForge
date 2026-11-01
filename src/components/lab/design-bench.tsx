import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Box,
  CheckCircle2,
  CircuitBoard,
  Cpu,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { designChat } from "@/lib/design-chat";
import { useActiveDesign, useBenchPlan, useLab, type ChatTurn } from "@/lib/lab-store";
import {
  designToOutput,
  sanitizeDesign,
  type DesignOutputT,
  type CustomDesign,
} from "@/lib/robots/design";
import { Button } from "@/components/ui/button";
import { chassisById, escLabel, servoLabel } from "@/lib/robots/chassis";
import { mcuName, type DeviceId } from "@/lib/wire/catalog";
import { buildPlan } from "@/lib/wire/plan";

const IDEAS = [
  "A 4-wheel rover with a sonar sensor on the front",
  "A robot arm with 4 servos that can pick up a cup",
  "A hexacopter with a camera gimbal",
];

export function DesignBench() {
  const chat = useLab((s) => s.chat);
  const customs = useLab((s) => s.customs);
  const pushChat = useLab((s) => s.pushChat);
  const clearChat = useLab((s) => s.clearChat);
  const saveDesign = useLab((s) => s.saveDesign);
  const activateDesign = useLab((s) => s.activateDesign);
  const deleteDesign = useLab((s) => s.deleteDesign);
  const setBench = useLab((s) => s.setBench);
  const setBoardView = useLab((s) => s.setBoardView);
  const active = useActiveDesign();
  const projectName = useLab((s) => s.projectName);
  const chassis = useLab((s) => s.chassis);
  const benchMcu = useLab((s) => s.mcu);
  const benchPicked = useLab((s) => s.picked);
  const sketch = useLab((s) => s.sketch);
  const part = useLab((s) => s.part);
  const plan = useBenchPlan();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [coachingMode, setCoachingMode] = useState<"explain" | "hint" | "design">("explain");
  const [proposal, setProposal] = useState<{ design: CustomDesign; signature: string } | null>(
    null,
  );
  const [undoId, setUndoId] = useState<string | null>(null);
  const projectId = useLab((s) => s.projectId);
  const engineering = useLab((s) => s.engineering);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const preset = chassisById(chassis);
  const faults = plan.issues.filter((i) => i.level === "fault");
  const componentCount = 1 + Object.values(benchPicked).reduce((sum, n) => sum + (n ?? 0), 0);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, busy]);

  useEffect(() => {
    setFresh(false);
    setDraft("");
    setProposal(null);
  }, [projectId, chassis, active?.id]);
  useEffect(() => {
    setUndoId(null);
  }, [projectId, chassis]);

  const openBoard = (view: "schematic" | "board") => {
    setBoardView(view);
    setBench("board");
  };

  const chooseSuggestion = (text: string) => {
    setDraft(text);
    inputRef.current?.focus();
  };

  const send = async (text: string) => {
    const msg = text.trim().slice(0, 2000);
    if (!msg || busy || proposal) return;
    setDraft("");
    setBusy(true);
    const turn: ChatTurn = { role: "user", text: msg };
    pushChat(turn);
    const local = localBoardAsk(msg);
    if (local) {
      openBoard(local.view);
      pushChat({ role: "assistant", text: local.reply });
      setBusy(false);
      return;
    }

    const before = projectSignature();
    const requestIsCurrent = () => {
      // Restoring or switching projects clears the old conversation. Do not
      // insert a late response into the replacement project's conversation.
      if (!useLab.getState().chat.includes(turn)) return false;
      if (before === projectSignature()) return true;
      pushChat({
        role: "assistant",
        text: "The project changed while I was working, so I kept your current setup. Send your request again if you still want that change.",
        error: true,
      });
      return false;
    };
    const editing = fresh ? null : active;
    const template = !fresh && !active;
    const current: DesignOutputT | null = fresh
      ? null
      : editing
        ? designToOutput({
            ...editing,
            projectName,
            mcu: benchMcu,
            picked: benchPicked,
            sketch,
            printPart: part,
          })
        : {
            name: preset.name,
            projectName,
            blurb: preset.blurb,
            motion:
              chassis === "plane"
                ? "plane"
                : chassis === "drone" || chassis === "heli"
                  ? "hover"
                  : "ground",
            controls: preset.drive,
            parts: [],
            mcu: benchMcu,
            devices: Object.entries(benchPicked)
              .filter(([, n]) => (n ?? 0) > 0)
              .map(([id, count]) => ({ id: id as DeviceId, count: count ?? 0 })),
            servoNames: Array.from(
              { length: (benchPicked.sg90 ?? 0) + (benchPicked.mg996 ?? 0) },
              (_, i) => servoLabel(chassis, i),
            ),
            motorNames: Array.from({ length: benchPicked.esc ?? 0 }, (_, i) =>
              escLabel(chassis, i),
            ),
            sketch,
            printPart: part,
          };
    const history = [...(fresh ? [] : chat.filter((t) => !t.error)), turn]
      .slice(-12)
      .map((t) => ({ role: t.role, text: t.text.slice(0, 2000) }));
    if (template) {
      const last = history.at(-1)!;
      last.text =
        last.text.slice(0, 1600) +
        "\n\nThe current project is a built-in " +
        preset.name +
        " template. Its geometry is procedural, so parts is empty in the context. Answer questions without changing it. If I request a change, reconstruct the complete machine geometry and preserve the current electronics except for requested changes.";
    }
    try {
      const res = await designChat({
        data: {
          messages: history,
          current,
          faults: fresh
            ? []
            : faults.slice(0, 12).map((i) => (i.title + ": " + i.detail).slice(0, 300)),
          coachingMode,
          engineeringContext: JSON.stringify({
            archetype: engineering.archetype,
            sizing: engineering.sizing,
            mission: {
              ...engineering.mission,
              summary: engineering.mission.summary.slice(0, 600),
              requirements: engineering.mission.requirements.slice(0, 8).map((requirement) => ({
                ...requirement,
                text: requirement.text.slice(0, 120),
                evidence: requirement.evidence.slice(0, 160),
              })),
            },
            leg: engineering.leg,
            flight: {
              ...engineering.flight,
              thrustSource: engineering.flight.thrustSource.slice(0, 300),
              massItems: engineering.flight.massItems
                .slice(0, 20)
                .map((item) => ({ ...item, source: item.source.slice(0, 120) })),
            },
            assembly: engineering.assembly,
            recentTests: engineering.notebook
              .slice(-3)
              .map(({ title, predicted, measured, unit, notes }) => ({
                title,
                predicted,
                measured,
                unit,
                notes,
              })),
          }).slice(0, 8000),
        },
      });
      if (!requestIsCurrent()) return;
      if (!res.ok) {
        pushChat({ role: "assistant", text: res.error, error: true });
        return;
      }
      let note = "";
      let designId = editing?.id;
      if (coachingMode !== "hint" && (res.changed || !current)) {
        const design = sanitizeDesign(res.design, editing?.id ?? newId());
        setProposal({ design, signature: before });
        designId = design.id;
        const after = buildPlan(design.mcu, design.picked, chassis, {
          servos: design.servoNames,
          motors: design.motorNames,
        });
        const n = after.issues.filter((i) => i.level === "fault").length;
        note = n
          ? "\n\nWiring check: " +
            n +
            " fault" +
            (n === 1 ? "" : "s") +
            " to review in Components & wiring."
          : "\n\nWiring check: no blocking wiring faults. Review the schematic and part datasheets before building.";
        note += "\n\nProposal ready. Review and apply it below to update your project.";
      }
      pushChat({ role: "assistant", text: res.reply + note, designId });
    } catch {
      if (requestIsCurrent()) {
        pushChat({
          role: "assistant",
          text: "Couldn't reach the design assistant. Your project is unchanged; try sending again.",
          error: true,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const applyProposal = () => {
    if (!proposal) return;
    if (proposal.signature !== projectSignature()) {
      setProposal(null);
      pushChat({
        role: "assistant",
        text: "Your project changed after this proposal was prepared. I kept the current version; request an updated proposal.",
        error: true,
      });
      return;
    }
    useLab.getState().saveSnapshot();
    const beforeId = useLab.getState().snapshots[0]?.id ?? null;
    saveDesign(proposal.design);
    setProposal(null);
    setFresh(false);
    setUndoId(beforeId);
    pushChat({
      role: "assistant",
      text: "Proposal applied. The previous setup is available in restore points.",
      designId: proposal.design.id,
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <section
        className="flex min-h-stage min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel xl:col-span-2"
        aria-labelledby="assistant-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 id="assistant-heading" className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="size-4 text-cyan" aria-hidden />
              Design assistant
            </h2>
            <p className="mt-1 text-xs text-dust">
              {fresh
                ? "New idea · current project stays until a design is ready"
                : "Working on " + projectName}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {fresh ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setFresh(false)}
                className="min-h-11 rounded-md border border-line px-3 text-sm disabled:opacity-40"
              >
                Use current project
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setFresh(true);
                  setProposal(null);
                  clearChat();
                  setDraft("");
                  inputRef.current?.focus();
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm disabled:opacity-40"
              >
                <Plus className="size-4" aria-hidden />
                New idea
              </button>
            )}
            {chat.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={clearChat}
                className="min-h-11 rounded-md px-3 text-sm text-dust hover:text-paper disabled:opacity-40"
              >
                Clear chat
              </button>
            )}
          </div>
        </div>

        <div
          ref={listRef}
          className="max-h-96 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6"
          role="log"
          aria-label="Design conversation"
          aria-live="polite"
          aria-busy={busy}
        >
          {chat.length === 0 && (
            <div className="py-4">
              <MessageSquare className="mb-4 size-6 text-cyan" aria-hidden />
              <h3 className="text-xl font-semibold tracking-tight">
                {fresh ? "Start with an idea." : "Build on your current design."}
              </h3>
              <p className="mt-2 max-w-xl text-sm text-dust">
                {fresh
                  ? "Describe the machine, how it should move, and the parts you need. Noah Forge drafts a model and a checked wiring plan."
                  : "Ask about this project's parts, request a change, or review its wiring. Your schematic, layout, and starter firmware follow the same component setup."}
              </p>
              <div className="mt-5 grid gap-2">
                {(fresh
                  ? IDEAS
                  : [
                      "Explain the components and power requirements of this design",
                      "Review this design and fix any wiring faults",
                      "Add a sonar sensor to this design",
                    ]
                ).map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    disabled={busy}
                    onClick={() => chooseSuggestion(idea)}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-left text-sm hover:bg-raised disabled:opacity-40"
                  >
                    <span>{idea}</span>
                    <ArrowRight className="size-4 shrink-0 text-dust" aria-hidden />
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-dust">
                Choose a suggestion to edit it before sending.
              </p>
            </div>
          )}
          {chat.map((t, i) => (
            <div
              key={i}
              className={
                "min-w-0 rounded-lg p-3 " +
                (t.role === "user"
                  ? "bg-raised"
                  : t.error
                    ? "border border-magenta/60"
                    : "border border-line")
              }
            >
              <p className="mb-1 text-xs font-semibold text-dust">
                {t.role === "user" ? "You" : t.error ? "Assistant unavailable" : "Noah Forge"}
              </p>
              <p className="whitespace-pre-line break-words text-sm leading-relaxed">{t.text}</p>
            </div>
          ))}
          {busy && (
            <p className="flex items-center gap-2 text-sm text-dust">
              <Loader2 className="size-4 shrink-0 animate-spin text-cyan" aria-hidden />
              Reviewing the design. This can take up to a minute.
            </p>
          )}
        </div>

        <div className="border-t border-line px-4 py-3">
          <label className="flex flex-wrap items-center gap-3 text-xs font-medium text-dust">
            Assistant approach
            <select
              aria-label="Assistant approach"
              value={coachingMode}
              disabled={busy || !!proposal}
              onChange={(event) => setCoachingMode(event.target.value as typeof coachingMode)}
              className="min-h-11 rounded-md border border-line bg-hangar px-3 text-sm text-paper"
            >
              <option value="explain">Explain the engineering</option>
              <option value="hint">Give me a hint</option>
              <option value="design">Propose a design change</option>
            </select>
          </label>
        </div>
        {proposal && (
          <section
            className="m-4 rounded-xl border border-cyan bg-hangar p-4"
            aria-label="Review AI proposal"
          >
            <h3 className="font-semibold">Review proposal: {proposal.design.name}</h3>
            <p className="mt-2 text-sm text-dust">{proposal.design.blurb}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <dt>Controller</dt>
              <dd>
                {mcuName(benchMcu)} → {mcuName(proposal.design.mcu)}
              </dd>
              <dt>Catalog devices</dt>
              <dd>
                {Object.values(benchPicked).reduce((sum, n) => sum + (n ?? 0), 0)} →{" "}
                {Object.values(proposal.design.picked).reduce((sum, n) => sum + (n ?? 0), 0)}
              </dd>
              <dt>Model parts</dt>
              <dd>{proposal.design.parts.length}</dd>
            </dl>
            <ul className="mt-3 text-xs text-dust">
              {[...new Set([...Object.keys(proposal.design.picked), ...Object.keys(benchPicked)])]
                .filter(
                  (id) =>
                    (proposal.design.picked[id as DeviceId] ?? 0) !==
                    (benchPicked[id as DeviceId] ?? 0),
                )
                .map((id) => (
                  <li key={id}>
                    {id}: {benchPicked[id as DeviceId] ?? 0} →{" "}
                    {proposal.design.picked[id as DeviceId] ?? 0}
                  </li>
                ))}
            </ul>
            {Object.keys(useLab.getState().pinOverrides).length > 0 && (
              <p className="mt-3 text-xs text-dust">
                Applying this machine proposal resets manual pin assignments to automatic
                allocation. The current assignments remain in its restore point.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={applyProposal}>
                Apply proposal
              </Button>
              <Button onClick={() => setProposal(null)}>Discard proposal</Button>
            </div>
          </section>
        )}
        {undoId && (
          <Button
            className="mx-4 mb-3"
            onClick={() => {
              useLab.getState().restoreSnapshot(undoId);
              setUndoId(null);
            }}
          >
            Undo applied proposal
          </Button>
        )}
        <form
          className="border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <label className="sr-only" htmlFor="design-msg">
            Message the design assistant
          </label>
          <textarea
            ref={inputRef}
            id="design-msg"
            value={draft}
            disabled={busy || !!proposal}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(draft);
              }
            }}
            rows={3}
            maxLength={2000}
            placeholder={
              fresh
                ? "Describe the machine you want to build…"
                : "Ask a question or describe what to change…"
            }
            className="min-h-24 w-full resize-y rounded-md border border-line bg-hangar p-3 text-sm outline-none focus:border-cyan disabled:opacity-60"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-dust">Enter to send · Shift + Enter for a new line</p>
            <button
              type="submit"
              disabled={busy || !!proposal || !draft.trim()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-cyan px-4 text-sm font-semibold text-ink disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              Send message
            </button>
          </div>
          <p className="mt-3 text-xs text-dust">
            Sending uses the configured AI API credit. The assistant uses the available component
            catalog and starter firmware templates.
          </p>
        </form>
      </section>

      <aside className="flex min-w-0 flex-col gap-4">
        <section
          className="rounded-xl border border-line bg-panel p-4"
          aria-labelledby="project-summary-heading"
        >
          <p className="text-xs font-medium text-dust">CURRENT PROJECT</p>
          <h2 id="project-summary-heading" className="mt-2 break-words text-lg font-semibold">
            {projectName}
          </h2>
          <p className="mt-1 text-sm text-dust">{active ? active.blurb : preset.blurb}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-line py-3 text-sm">
            <div>
              <dt className="text-xs text-dust">Controller</dt>
              <dd className="mt-1 font-medium">{mcuName(benchMcu)}</dd>
            </div>
            <div>
              <dt className="text-xs text-dust">Components</dt>
              <dd className="mt-1 font-mono">{componentCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-dust">Assigned pins</dt>
              <dd className="mt-1 font-mono">{plan.pins.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-dust">Design source</dt>
              <dd className="mt-1">{active ? "Custom draft" : preset.name + " template"}</dd>
            </div>
          </dl>
          <div className="mt-3 grid gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => setBench("wire")}
              className="flex min-h-11 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-raised disabled:opacity-40"
            >
              <Cpu className="size-4 text-dust" aria-hidden />
              Components & wiring
              <ArrowRight className="ml-auto size-4 text-dust" aria-hidden />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => openBoard("schematic")}
              className="flex min-h-11 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-raised disabled:opacity-40"
            >
              <CircuitBoard className="size-4 text-dust" aria-hidden />
              Review schematic
              <ArrowRight className="ml-auto size-4 text-dust" aria-hidden />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => openBoard("board")}
              className="flex min-h-11 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-raised disabled:opacity-40"
            >
              <CircuitBoard className="size-4 text-dust" aria-hidden />
              Explore PCB layout
              <ArrowRight className="ml-auto size-4 text-dust" aria-hidden />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setBench("frame")}
              className="flex min-h-11 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-raised disabled:opacity-40"
            >
              <Box className="size-4 text-dust" aria-hidden />
              Open 3D assembly
              <ArrowRight className="ml-auto size-4 text-dust" aria-hidden />
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-panel p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {faults.length ? (
              <TriangleAlert className="size-4 text-magenta" aria-hidden />
            ) : (
              <CheckCircle2 className="size-4 text-mint" aria-hidden />
            )}
            {faults.length
              ? faults.length + " wiring fault" + (faults.length === 1 ? "" : "s") + " to review"
              : "No blocking wiring faults"}
          </h2>
          <p className="mt-2 text-xs text-dust">
            {faults[0]?.title ??
              "The current setup passes the wiring model. Review cautions and component datasheets before building."}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setBench("wire")}
            className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-cyan disabled:opacity-40"
          >
            Review all checks
            <ArrowRight className="size-4" aria-hidden />
          </button>
        </section>

        <details className="rounded-xl border border-line bg-panel p-4">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold">
            AI designs <span className="ml-1 text-dust">({customs.length})</span>
          </summary>
          {customs.length === 0 ? (
            <p className="mt-2 text-xs text-dust">
              AI drafts appear here after a design request and save to your cloud workspace.
            </p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {[...customs].reverse().map((d) => (
                <li
                  key={d.id}
                  className={
                    "flex min-w-0 items-stretch rounded-md border " +
                    (d.id === active?.id ? "border-cyan bg-raised" : "border-line")
                  }
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      activateDesign(d.id);
                      setFresh(false);
                      clearChat();
                    }}
                    aria-pressed={d.id === active?.id}
                    className="min-h-11 min-w-0 flex-1 px-3 py-2 text-left disabled:opacity-40"
                  >
                    <span className="block truncate text-sm font-medium">{d.name}</span>
                    <span className="line-clamp-2 text-xs text-dust">{d.blurb}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Delete " + d.name + "?")) deleteDesign(d.id);
                    }}
                    className="flex min-h-11 w-11 shrink-0 items-center justify-center text-dust hover:text-magenta disabled:opacity-40"
                    aria-label={"Delete " + d.name}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>
      </aside>
    </div>
  );
}

function projectSignature(): string {
  const s = useLab.getState();
  const design = s.customs.find((item) => item.id === s.customId) ?? null;
  return JSON.stringify([
    s.customId,
    s.chassis,
    s.projectName,
    s.mcu,
    s.picked,
    s.pinOverrides,
    s.sketch,
    s.part,
    s.projectId,
    s.engineering,
    design,
  ]);
}

function newId(): string {
  return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Navigation requests use the real local project without spending an AI call. */
function localBoardAsk(text: string): { view: "schematic" | "board"; reply: string } | null {
  if (
    text.length > 90 ||
    /\b(add|remove|longer|shorter|build|make me|change|give me|design a|with a|why|how|explain)\b/i.test(
      text,
    )
  )
    return null;
  if (/\b(route|pcb|layout)\b/i.test(text))
    return {
      view: "board",
      reply:
        "Opened the conceptual PCB layout for this project. Use the net inspector to follow connections and review the checks before exporting an SVG.",
    };
  if (/\b(schematic|circuit)\b/i.test(text))
    return {
      view: "schematic",
      reply:
        "Opened the schematic for your current components. Select a net to follow its connections.",
    };
  if (/\b(bom|bill of materials|parts list)\b/i.test(text))
    return {
      view: "schematic",
      reply:
        "The board workspace includes the current parts list and BOM export. Prices are not looked up live.",
    };
  return null;
}
