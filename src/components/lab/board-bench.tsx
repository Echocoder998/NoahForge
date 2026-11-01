import { useMemo, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Focus,
  RefreshCw,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { bomCsv, buildPacket, type Check, type Trace, type WireKind } from "@/lib/board/build";
import { boardSvg, schematicSvg } from "@/lib/board/svg";
import { kicadNetlist } from "@/lib/board/netlist";
import { useBenchPlan, useLab } from "@/lib/lab-store";

const STROKE: Record<WireKind, string> = {
  power: "var(--color-magenta)",
  ground: "var(--color-dust)",
  signal: "var(--color-cyan)",
  i2c: "var(--color-mint)",
  uart: "var(--color-paper)",
};

export function BoardBench() {
  const projectName = useLab((s) => s.projectName);
  const picked = useLab((s) => s.picked);
  const view = useLab((s) => s.boardView);
  const setView = useLab((s) => s.setBoardView);
  const setBench = useLab((s) => s.setBench);
  const plan = useBenchPlan();
  const [pass, setPass] = useState(0);
  const packet = useMemo(
    () => buildPacket(projectName, plan, picked),
    [projectName, plan, picked, pass],
  );
  const [selectedNet, setSelectedNet] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [inspector, setInspector] = useState("checks");
  const [partSearch, setPartSearch] = useState("");
  const [netSearch, setNetSearch] = useState("");
  const [refreshed, setRefreshed] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const netNames = [
    ...new Set([
      ...packet.schematic.wires.map((w) => w.net),
      ...packet.board.traces.map((t) => t.net),
    ]),
  ].sort();
  const net = selectedNet && netNames.includes(selectedNet) ? selectedNet : null;
  const netPads = packet.board.parts.flatMap((part) =>
    part.pads
      .filter((pad) => pad.net === net)
      .map((pad) => `${part.ref} · ${part.name} · ${pad.name}`),
  );
  const netWires = packet.schematic.wires.filter((wire) => wire.net === net);
  const parts = packet.bom.filter((line) =>
    `${line.part} ${line.ref} ${line.note}`.toLowerCase().includes(partSearch.toLowerCase()),
  );
  const nets = netNames.filter((name) => name.toLowerCase().includes(netSearch.toLowerCase()));
  const fails = packet.board.checks.filter((c) => c.level === "fail").length;
  const warnings = packet.board.checks.filter((c) => c.level === "warn").length;

  const download = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const fit = () => {
    setZoom(1);
    canvasRef.current?.scrollTo({ top: 0, left: 0 });
  };
  const pickNet = (name: string) => {
    setSelectedNet((current) => (current === name ? null : name));
    setInspector("nets");
  };

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-4">
      <section
        className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel xl:col-span-3"
        aria-label="Electronics drawing workspace"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
          <div
            className="flex rounded-lg border border-line bg-hangar p-1"
            role="group"
            aria-label="Board view"
          >
            {(
              [
                ["schematic", "Schematic"],
                ["board", "PCB layout"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => {
                  setView(id);
                  fit();
                }}
                className={`min-h-11 rounded-md px-3 text-sm font-medium ${view === id ? "bg-raised text-paper" : "text-dust hover:text-paper"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setView("board");
              setPass((n) => n + 1);
              setRefreshed(true);
              fit();
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-medium hover:bg-raised"
          >
            <RefreshCw className="size-4" aria-hidden />
            Regenerate layout
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-2 text-xs text-dust">
          <span>
            {view === "schematic"
              ? `${packet.schematic.blocks.length} blocks · ${netNames.length} nets`
              : `${packet.board.width} × ${packet.board.height} mm · 2 layers`}
          </span>
          <span className="rounded border border-line px-2 py-1">Concept preview</span>
        </div>
        <div
          ref={canvasRef}
          className="h-96 overflow-auto bg-hangar p-4 lg:h-128"
          tabIndex={0}
          aria-label={`${view === "schematic" ? "Schematic" : "PCB layout"} canvas. Scroll to explore the drawing.`}
        >
          <div className="mx-auto" style={{ width: `${zoom * 100}%` }}>
            {view === "schematic" ? (
              <SchematicView packet={packet} active={net} onPick={pickNet} />
            ) : (
              <LayoutView board={packet.board} pass={pass} active={net} onPick={pickNet} />
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2">
          <div className="flex items-center gap-1" role="group" aria-label="Canvas zoom">
            <button
              type="button"
              aria-label="Zoom out"
              disabled={zoom <= 0.5}
              onClick={() => setZoom((n) => Math.max(0.5, n - 0.25))}
              className="flex size-11 items-center justify-center rounded-md hover:bg-raised disabled:opacity-40"
            >
              <ZoomOut className="size-4" aria-hidden />
            </button>
            <output
              className="w-12 text-center font-mono text-xs text-dust"
              aria-label="Zoom level"
            >
              {Math.round(zoom * 100)}%
            </output>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={zoom >= 3}
              onClick={() => setZoom((n) => Math.min(3, n + 0.25))}
              className="flex size-11 items-center justify-center rounded-md hover:bg-raised disabled:opacity-40"
            >
              <ZoomIn className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={fit}
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm hover:bg-raised"
            >
              <Focus className="size-4" aria-hidden />
              Fit width
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              download(
                `${fileBase(projectName)}-${view === "schematic" ? "schematic" : "board"}.svg`,
                view === "schematic"
                  ? schematicSvg(packet.schematic, projectName)
                  : boardSvg(packet.board),
                "image/svg+xml",
              )
            }
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-cyan px-3 text-sm font-semibold text-ink"
          >
            <Download className="size-4" aria-hidden />
            Export {view === "schematic" ? "schematic" : "layout"} SVG
          </button>
        </div>
        <div className="border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={() =>
              download(
                `${fileBase(projectName)}-connectivity.net`,
                kicadNetlist(packet.board, projectName),
                "text/plain",
              )
            }
            className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm"
          >
            <Download className="size-4" aria-hidden />
            Export KiCad netlist
          </button>
          <p className="text-xs text-dust">
            Drawings update from your components and pin assignments. The KiCad netlist uses generic
            numbered connector pins; assign and verify real footprints and pin maps in CAD. SVG
            previews are for review; manufacturing needs a verified CAD layout and Gerber files.
            Servo power stays on the external BEC wiring.
          </p>
          <p role="status" className="mt-1 text-xs text-cyan">
            {refreshed
              ? "Layout refreshed from the current components."
              : "Select a wire or choose a net in the inspector to follow its connections."}
          </p>
        </div>
      </section>

      <aside
        className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel"
        aria-label="Electronics inspector"
      >
        <Tabs.Root value={inspector} onValueChange={setInspector}>
          <Tabs.List className="grid grid-cols-3 border-b border-line p-1" aria-label="Inspector">
            <Tabs.Trigger
              value="checks"
              className="min-h-11 rounded-md px-2 text-sm text-dust data-[state=active]:bg-raised data-[state=active]:text-paper"
            >
              Checks{fails > 0 ? ` (${fails})` : ""}
            </Tabs.Trigger>
            <Tabs.Trigger
              value="parts"
              className="min-h-11 rounded-md px-2 text-sm text-dust data-[state=active]:bg-raised data-[state=active]:text-paper"
            >
              Parts
            </Tabs.Trigger>
            <Tabs.Trigger
              value="nets"
              className="min-h-11 rounded-md px-2 text-sm text-dust data-[state=active]:bg-raised data-[state=active]:text-paper"
            >
              Nets
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="checks" className="p-4">
            <h2 className="text-sm font-semibold">Design review</h2>
            <p className="mt-1 text-xs text-dust">
              {fails} failed · {warnings} advisory · checks run as you edit
            </p>
            <ul className="mt-4 grid gap-3">
              {packet.board.checks.map((check) => (
                <CheckRow key={check.title} check={check} />
              ))}
            </ul>
            {fails > 0 && (
              <button
                type="button"
                onClick={() => setBench("wire")}
                className="mt-4 min-h-11 w-full rounded-md border border-line px-3 text-sm font-medium hover:bg-raised"
              >
                Review components & wiring
              </button>
            )}
          </Tabs.Content>
          <Tabs.Content value="parts" className="p-4">
            <h2 className="text-sm font-semibold">Bill of materials</h2>
            <p className="mt-1 text-xs text-dust">
              {packet.bom.reduce((sum, line) => sum + line.qty, 0)} items · {packet.bom.length} line
              items. Pricing and availability are not connected.
            </p>
            <SearchField
              id="board-parts-search"
              label="Search parts"
              value={partSearch}
              onChange={setPartSearch}
            />
            <ul className="mt-3 grid gap-3">
              {parts.map((line) => (
                <li
                  key={`${line.ref}-${line.part}`}
                  className="border-b border-line pb-3 last:border-0"
                >
                  <p className="text-sm">
                    <span className="mr-2 font-mono text-cyan">{line.qty}×</span>
                    {line.part}
                  </p>
                  <p className="mt-1 text-xs text-dust">
                    {line.ref} · {line.note}
                  </p>
                </li>
              ))}
            </ul>
            {parts.length === 0 && (
              <p className="py-4 text-sm text-dust">No parts match “{partSearch}”.</p>
            )}
            <button
              type="button"
              onClick={() =>
                download(`${fileBase(projectName)}-bom.csv`, bomCsv(packet.bom), "text/csv")
              }
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-medium hover:bg-raised"
            >
              <Download className="size-4" aria-hidden />
              Export BOM CSV
            </button>
          </Tabs.Content>
          <Tabs.Content value="nets" className="p-4">
            <h2 className="text-sm font-semibold">Inspect connections</h2>
            <p className="mt-1 text-xs text-dust">Choose a net to highlight it in both views.</p>
            {net && (
              <div className="mt-3 rounded-lg border border-line bg-hangar p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 break-all font-mono text-sm text-cyan">{net}</p>
                  <button
                    type="button"
                    onClick={() => setSelectedNet(null)}
                    aria-label="Clear selected net"
                    className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-raised"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
                <p className="text-xs text-dust">
                  {netWires.length} schematic connections · {netPads.length} PCB pads
                </p>
                <ul className="mt-2 space-y-1 text-xs text-dust">
                  {netPads.map((pad, index) => (
                    <li key={`${pad}-${index}`}>{pad}</li>
                  ))}
                </ul>
              </div>
            )}
            <SearchField
              id="board-net-search"
              label="Search nets"
              value={netSearch}
              onChange={setNetSearch}
            />
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Select a net">
              {nets.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={net === name}
                  onClick={() => pickNet(name)}
                  className={`min-h-11 break-all rounded-md border px-2 py-2 text-left font-mono text-xs ${net === name ? "border-cyan bg-raised text-cyan" : "border-line text-dust hover:text-paper"}`}
                >
                  {name}
                </button>
              ))}
            </div>
            {nets.length === 0 && (
              <p className="py-4 text-sm text-dust">No nets match “{netSearch}”.</p>
            )}
          </Tabs.Content>
        </Tabs.Root>
      </aside>
    </div>
  );
}

function SearchField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="mt-4 flex min-h-11 items-center gap-2 rounded-md border border-line bg-hangar px-3"
    >
      <Search className="size-4 shrink-0 text-dust" aria-hidden />
      <span className="sr-only">{label}</span>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
      />
    </label>
  );
}

function SchematicView({
  packet,
  active,
  onPick,
}: {
  packet: ReturnType<typeof buildPacket>;
  active: string | null;
  onPick: (net: string) => void;
}) {
  const sch = packet.schematic;
  return (
    <svg
      viewBox={`0 0 ${sch.width} ${sch.height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Schematic. Use the Nets inspector to select connections with a keyboard."
    >
      <rect width={sch.width} height={sch.height} fill="var(--color-hangar)" />
      {sch.wires.map((wire, index) => {
        const mid = wire.x1 + 28 + (index % 6) * 6;
        const on = !active || active === wire.net;
        return (
          <path
            key={`${wire.net}-${index}`}
            d={`M${wire.x1} ${wire.y1} H${mid} V${wire.y2} H${wire.x2}`}
            fill="none"
            stroke={STROKE[wire.kind]}
            strokeWidth={on ? 2 : 1.2}
            opacity={on ? 1 : 0.15}
            className="cursor-pointer"
            onClick={() => onPick(wire.net)}
          >
            <title>{wire.net}</title>
          </path>
        );
      })}
      {sch.blocks.map((block) => (
        <g key={block.ref}>
          <rect
            x={block.x}
            y={block.y}
            width={block.w}
            height={block.h}
            rx={6}
            fill="var(--color-raised)"
            stroke="var(--color-line)"
            strokeWidth={1.5}
          />
          <text x={block.x + 10} y={block.y + 18} fill="var(--color-cyan)" fontSize={11}>
            {block.ref}
          </text>
          <text x={block.x + 10} y={block.y + 36} fill="var(--color-paper)" fontSize={14}>
            {block.name}
          </text>
          {block.pins.map((pin) => (
            <g key={`${block.ref}-${pin.side}-${pin.name}`}>
              <circle cx={pin.x} cy={pin.y} r={3.2} fill="var(--color-cyan)" />
              <text
                x={pin.side === "left" ? pin.x + 8 : pin.x - 8}
                y={pin.y + 3}
                textAnchor={pin.side === "left" ? "start" : "end"}
                fill="var(--color-dust)"
                fontSize={10}
              >
                {pin.name}
              </text>
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

function LayoutView({
  board,
  pass,
  active,
  onPick,
}: {
  board: ReturnType<typeof buildPacket>["board"];
  pass: number;
  active: string | null;
  onPick: (net: string) => void;
}) {
  const width = board.width;
  const height = board.height;
  return (
    <svg
      viewBox={`-4 -4 ${width + 8} ${height + 8}`}
      className="mx-auto h-auto w-full"
      role="img"
      aria-label="Concept breakout layout. Use the Nets inspector to select connections with a keyboard."
    >
      <rect
        width={width}
        height={height}
        rx={2}
        fill="var(--color-raised)"
        stroke="var(--color-dust)"
        strokeWidth={0.35}
      />
      {board.traces.map((trace, index) => (
        <TracePath
          key={`${trace.net}-${trace.layer}-${index}-${pass}`}
          trace={trace}
          dim={!!active && active !== trace.net}
          onPick={onPick}
        />
      ))}
      {board.traces
        .filter((trace) => trace.layer === "bottom")
        .flatMap((trace) => trace.points)
        .map((point, index) => (
          <circle
            key={`via-${index}`}
            cx={point.x}
            cy={point.y}
            r={0.55}
            fill="var(--color-hangar)"
            stroke="var(--color-dust)"
            strokeWidth={0.18}
          />
        ))}
      {board.parts.map((part) => (
        <g key={part.ref}>
          <rect
            x={part.x}
            y={part.y}
            width={part.w}
            height={part.h}
            fill="none"
            stroke="var(--color-paper)"
            strokeWidth={0.22}
          />
          <text x={part.x + 1} y={part.y - 0.6} fill="var(--color-paper)" fontSize={1.7}>
            {part.ref} {part.name}
          </text>
          {part.pads.map((pad) => (
            <g
              key={`${part.ref}-${pad.name}`}
              onClick={() => onPick(pad.net)}
              className="cursor-pointer"
            >
              <circle
                cx={pad.x}
                cy={pad.y}
                r={0.72}
                fill={active === pad.net ? "var(--color-cyan)" : "var(--color-paper)"}
                opacity={!active || active === pad.net ? 1 : 0.25}
              />
              <title>
                {part.ref} {pad.name} · {pad.net}
              </title>
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

function TracePath({
  trace,
  dim,
  onPick,
}: {
  trace: Trace;
  dim: boolean;
  onPick: (net: string) => void;
}) {
  return (
    <path
      d={trace.points
        .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
        .join(" ")}
      fill="none"
      stroke={trace.layer === "bottom" ? "var(--color-dust)" : STROKE[trace.kind]}
      strokeWidth={trace.width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={dim ? 0.15 : trace.layer === "bottom" ? 0.65 : 1}
      pathLength={1}
      strokeDasharray={1}
      className="cursor-pointer"
      style={{ animation: "trace-draw 700ms ease-out both" }}
      onClick={() => onPick(trace.net)}
    >
      <title>
        {trace.net} · {trace.layer} layer
      </title>
    </path>
  );
}

function CheckRow({ check }: { check: Check }) {
  const Icon = check.level === "pass" ? CheckCircle2 : AlertTriangle;
  const color =
    check.level === "fail" ? "text-magenta" : check.level === "warn" ? "text-dust" : "text-mint";
  return (
    <li className="border-b border-line pb-3 last:border-0">
      <p className="flex items-start gap-2 text-sm font-medium">
        <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} aria-hidden />
        <span>{check.title}</span>
      </p>
      <p className="mt-1 text-xs text-dust">{check.detail}</p>
    </li>
  );
}

function fileBase(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "noah-forge"
  );
}
