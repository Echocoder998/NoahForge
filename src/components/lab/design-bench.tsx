import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { designChat } from "@/lib/design-chat";
import { useActiveDesign, useBenchPlan, useLab, type ChatTurn } from "@/lib/lab-store";
import { designToOutput, sanitizeDesign } from "@/lib/robots/design";
import { buildPlan } from "@/lib/wire/plan";

const IDEAS = [
  "A 4-wheel rover with a sonar sensor on the front",
  "A robot arm with 4 servos that can pick up a cup",
  "A hexacopter with a camera gimbal",
  "A tank with tracks and a turret",
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
  const active = useActiveDesign();
  const benchMcu = useLab((s) => s.mcu);
  const benchPicked = useLab((s) => s.picked);
  const plan = useBenchPlan();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // "New design" means the next message starts from nothing, even if a design is open.
  const [fresh, setFresh] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, busy]);

  const editing = fresh ? null : active;

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    setDraft("");
    setBusy(true);
    const turn: ChatTurn = { role: "user", text: msg };
    pushChat(turn);
    const history = [...chat.filter((t) => !t.error), turn].slice(-12).map((t) => ({ role: t.role, text: t.text }));
    const faults = editing ? plan.issues.filter((i) => i.level === "fault").map((i) => `${i.title}: ${i.detail}`) : [];
    try {
      const res = await designChat({
        data: { messages: history, current: editing ? designToOutput({ ...editing, mcu: benchMcu, picked: benchPicked }) : null, faults },
      });
      if (!res.ok) {
        pushChat({ role: "assistant", text: res.error, error: true });
        return;
      }
      let note = "";
      let designId = editing?.id;
      if (res.changed || !editing) {
        const design = sanitizeDesign(res.design, editing?.id ?? newId());
        saveDesign(design);
        designId = design.id;
        setFresh(false);
        const after = buildPlan(design.mcu, design.picked, "plane", {
          servos: design.servoNames,
          motors: design.motorNames,
        });
        const n = after.issues.filter((i) => i.level === "fault").length;
        note = n
          ? `\n\nWiring check: ${n} fault${n === 1 ? "" : "s"} to fix. Open Wire to see ${n === 1 ? "it" : "them"}, or ask me to fix ${n === 1 ? "it" : "them"}.`
          : "\n\nWiring check: no faults.";
      }
      pushChat({ role: "assistant", text: res.reply + note, designId });
    } catch {
      pushChat({ role: "assistant", text: "Something went wrong reaching Claude. Try again.", error: true });
    } finally {
      setBusy(false);
    }
  };

  const startNew = () => {
    setFresh(true);
    clearChat();
  };

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex min-h-[32rem] min-w-0 flex-col rounded-md border border-line bg-panel">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-mint">
              <Sparkles className="size-3.5" aria-hidden />
              DESIGN WITH CLAUDE
            </p>
            <p className="mt-1 truncate text-sm text-dust">
              {editing ? `Changing ${editing.name}` : "Describe a machine and Claude will draft it."}
            </p>
          </div>
          <button
            type="button"
            onClick={startNew}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-dust hover:text-paper"
          >
            <Plus className="size-4" aria-hidden />
            New design
          </button>
        </div>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
          {chat.length === 0 && (
            <div>
              <p className="text-sm text-dust">Try one of these, or type your own idea:</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {IDEAS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    disabled={busy}
                    onClick={() => void send(idea)}
                    className="min-h-11 rounded-md border border-line bg-hangar px-3 py-2 text-left text-sm hover:border-cyan"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chat.map((t, i) => (
            <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <p
                className={`max-w-[85%] whitespace-pre-line rounded-md px-3 py-2 text-sm ${
                  t.role === "user"
                    ? "bg-raised text-paper"
                    : t.error
                      ? "border border-magenta/60 text-paper"
                      : "border border-line bg-hangar text-paper"
                }`}
              >
                {t.text}
              </p>
            </div>
          ))}
          {busy && (
            <p className="flex items-center gap-2 text-sm text-cyan">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Claude is designing… this can take up to a minute.
            </p>
          )}
        </div>

        <form
          className="flex gap-2 border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <label className="sr-only" htmlFor="design-msg">
            Message Claude
          </label>
          <textarea
            id="design-msg"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={editing ? "Make the arms longer, add a sonar…" : "A six-wheel rover that can climb curbs…"}
            className="min-h-11 flex-1 resize-none rounded-md border border-line bg-hangar px-3 py-2 text-sm outline-none focus:border-cyan"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-cyan px-4 text-sm font-semibold text-ink disabled:opacity-40"
            aria-label="Send"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          </button>
        </form>
      </section>

      <aside className="min-w-0 rounded-md border border-line bg-panel p-4">
        <p className="font-mono text-xs tracking-widest text-dust">YOUR DESIGNS</p>
        {customs.length === 0 ? (
          <p className="mt-2 text-sm text-dust">Designs Claude makes show up here and next to Plane, Drone and the rest.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {[...customs].reverse().map((d) => {
              const on = d.id === active?.id;
              return (
                <li
                  key={d.id}
                  className={`flex items-stretch gap-1 rounded-md border ${on ? "border-cyan bg-raised" : "border-line"}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      activateDesign(d.id);
                      setFresh(false);
                    }}
                    className="min-h-11 min-w-0 flex-1 px-3 py-2 text-left"
                  >
                    <span className="block truncate text-sm font-semibold">{d.name}</span>
                    <span className="line-clamp-2 text-xs text-dust">{d.blurb}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete ${d.name}?`)) deleteDesign(d.id);
                    }}
                    className="flex min-h-11 w-11 shrink-0 items-center justify-center text-dust hover:text-magenta"
                    aria-label={`Delete ${d.name}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {active && (
          <button
            type="button"
            onClick={() => setBench("frame")}
            className="mt-4 min-h-11 w-full rounded-md bg-cyan px-4 text-sm font-semibold text-ink"
          >
            Test {active.name} in the bay
          </button>
        )}
        <p className="mt-4 text-xs text-dust">
          Claude only picks parts from the Wire catalog and a starter sketch from the Code list. The wiring check
          still decides what is safe. Each message costs a few cents of API credit.
        </p>
      </aside>
    </div>
  );
}

function newId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
