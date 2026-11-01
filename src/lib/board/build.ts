import { mcuName, type DeviceId } from "../wire/catalog";
import { countOf, type Counts, type Plan, type WireKind } from "../wire/plan";

export type { WireKind };

export type CheckLevel = "pass" | "warn" | "fail";

export type Check = { level: CheckLevel; title: string; detail: string };

export type Pad = {
  name: string;
  x: number;
  y: number;
  net: string;
  kind: WireKind;
};

export type Comp = {
  ref: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pads: Pad[];
};

export type Trace = {
  net: string;
  kind: WireKind;
  width: number;
  layer: "top" | "bottom";
  points: { x: number; y: number }[];
};

export type Board = {
  name: string;
  width: number;
  height: number;
  parts: Comp[];
  traces: Trace[];
  checks: Check[];
};

export type SchPin = { name: string; x: number; y: number; side: "left" | "right" };
export type SchBlock = {
  ref: string;
  name: string;
  sub: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pins: SchPin[];
};
export type SchWire = {
  kind: WireKind;
  net: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};
export type Schematic = { width: number; height: number; blocks: SchBlock[]; wires: SchWire[] };

export type BomLine = { qty: number; ref: string; part: string; note: string };

export type Packet = { board: Board; schematic: Schematic; bom: BomLine[] };

type Sig = {
  name: string;
  pin: string;
  kind: WireKind;
  pins: { name: string; net: string; kind: WireKind }[];
};

/** Schematic, 2-layer breakout, and parts list for whatever is on the bench. */
export function buildPacket(projectName: string, plan: Plan, counts: Counts): Packet {
  const sigs = signalsOf(plan);
  const board = layoutBoard(projectName, plan, counts, sigs);
  const schematic = layoutSchematic(projectName, plan, counts, sigs);
  const bom = layoutBom(plan, counts, board);
  return { board, schematic, bom };
}

function signalsOf(plan: Plan): Sig[] {
  const out: Sig[] = [];
  for (const s of plan.servos) {
    const net = `D${s.pin}`;
    out.push({
      name: s.name,
      pin: s.pin,
      kind: "signal",
      pins: [{ name: "SIG", net, kind: "signal" }],
    });
  }
  for (const e of plan.escs) {
    out.push({
      name: e.name,
      pin: e.pin,
      kind: "signal",
      pins: [{ name: "SIG", net: `D${e.pin}`, kind: "signal" }],
    });
  }
  if (plan.drv) {
    out.push({
      name: "DRV8833",
      pin: plan.drv.in1,
      kind: "signal",
      pins: [
        { name: "IN1", net: `D${plan.drv.in1}`, kind: "signal" },
        { name: "IN2", net: `D${plan.drv.in2}`, kind: "signal" },
        { name: "IN3", net: `D${plan.drv.in3}`, kind: "signal" },
        { name: "IN4", net: `D${plan.drv.in4}`, kind: "signal" },
      ],
    });
  }
  if (plan.i2c) {
    for (const d of plan.i2c.devices) {
      out.push({
        name: d.name,
        pin: plan.i2c.sda,
        kind: "i2c",
        pins: [
          { name: "SDA", net: "SDA", kind: "i2c" },
          { name: "SCL", net: "SCL", kind: "i2c" },
        ],
      });
    }
  }
  if (plan.gps) {
    out.push({
      name: "GPS",
      pin: plan.gps.rx,
      kind: "uart",
      pins: [
        { name: "TX", net: "GPS_TX", kind: "uart" },
        { name: "RX", net: "GPS_RX", kind: "uart" },
      ],
    });
  }
  if (plan.sonar) {
    out.push({
      name: "Sonar",
      pin: plan.sonar.trig,
      kind: "signal",
      pins: [
        { name: "TRIG", net: `D${plan.sonar.trig}`, kind: "signal" },
        { name: "ECHO", net: `D${plan.sonar.echo}`, kind: "signal" },
      ],
    });
  }
  if (plan.receiver) {
    const r = plan.receiver;
    out.push({
      name: "Receiver",
      pin: r.ail,
      kind: "signal",
      pins: [
        { name: "AIL", net: `D${r.ail}`, kind: "signal" },
        { name: "ELE", net: `D${r.ele}`, kind: "signal" },
        { name: "THR", net: `D${r.thr}`, kind: "signal" },
        { name: "RUD", net: `D${r.rud}`, kind: "signal" },
      ],
    });
  }
  return out;
}

function layoutBoard(projectName: string, plan: Plan, counts: Counts, sigs: Sig[]): Board {
  const pitch = 2.54;
  const uniqueNets = new Set(sigs.flatMap((s) => s.pins.map((p) => p.net)));
  const mcuPinCount = uniqueNets.size + 2;
  const mcuH = Math.max(28, 8 + mcuPinCount * pitch);
  const headerH =
    sigs.reduce((n, s) => n + Math.max(10, 6 + s.pins.length * pitch), 0) +
    Math.max(0, sigs.length - 1) * 3;
  const height = Math.max(62, 14 + Math.max(mcuH, headerH));
  // Shared I2C pins use the same lane; header count must not expand the route.
  const laneByNet = new Map([...uniqueNets].map((net, i) => [net, i]));
  const lanes = Math.max(1, laneByNet.size);
  const lane0 = 24 + 22 + 2.2;
  const lastLane = lane0 + (lanes - 1) * 1.6;
  const width = Math.max(100, lastLane + 30);
  const mcuW = 22;
  const mcuX = 24;
  const mcuY = (height - mcuH) / 2;

  const parts: Comp[] = [];
  const powerPins: Pad[] = [
    { name: "VIN", x: 3, y: 4, net: "VIN", kind: "power" },
    { name: "GND", x: 3, y: 4 + pitch, net: "GND", kind: "ground" },
  ];
  parts.push({
    ref: "J1",
    name: powerName(plan, counts),
    x: 6,
    y: 8,
    w: 14,
    h: 8 + pitch,
    pads: powerPins.map((p) => ({ ...p, x: 6 + p.x, y: 8 + p.y })),
  });

  const mcuPads: Pad[] = [];
  let py = mcuY + 4;
  mcuPads.push({ name: "VIN", x: mcuX + 2, y: py, net: "VIN", kind: "power" });
  py += pitch;
  mcuPads.push({ name: "GND", x: mcuX + 2, y: py, net: "GND", kind: "ground" });
  py += pitch;
  const seenNet = new Set<string>();
  for (const s of sigs) {
    for (const pin of s.pins) {
      if (seenNet.has(pin.net)) continue;
      seenNet.add(pin.net);
      mcuPads.push({
        name: pin.name === "SIG" ? `D${s.pin}` : pin.net,
        x: mcuX + mcuW - 2,
        y: py,
        net: pin.net,
        kind: pin.kind,
      });
      py += pitch;
    }
  }
  parts.push({
    ref: "U1",
    name: mcuName(plan.mcu),
    x: mcuX,
    y: mcuY,
    w: mcuW,
    h: mcuH,
    pads: mcuPads,
  });

  let hy = 8;
  let jn = 2;
  const headers: Comp[] = [];
  for (const s of sigs) {
    const h = Math.max(10, 6 + s.pins.length * pitch);
    const pads: Pad[] = s.pins.map((pin, i) => ({
      name: pin.name,
      x: width - 16,
      y: hy + 4 + i * pitch,
      net: pin.net,
      kind: pin.kind,
    }));
    pads.push({
      name: "GND",
      x: width - 16,
      y: hy + 4 + s.pins.length * pitch,
      net: "GND",
      kind: "ground",
    });
    const comp: Comp = { ref: `J${jn++}`, name: s.name, x: width - 18, y: hy, w: 14, h, pads };
    headers.push(comp);
    parts.push(comp);
    hy += h + 3;
  }

  const traces: Trace[] = [];
  const vinMcu = mcuPads.find((p) => p.net === "VIN")!;
  const vinJ = parts[0]!.pads.find((p) => p.net === "VIN")!;
  traces.push({
    net: "VIN",
    kind: "power",
    width: 0.8,
    layer: "top",
    points: [
      { x: vinJ.x, y: vinJ.y },
      { x: 18, y: vinJ.y },
      { x: 18, y: vinMcu.y },
      { x: vinMcu.x, y: vinMcu.y },
    ],
  });

  for (const header of headers) {
    for (const pad of header.pads) {
      if (pad.kind === "ground" || pad.kind === "power") continue;
      const src = mcuPads.find((p) => p.net === pad.net && p.kind !== "ground");
      if (!src) continue;
      const x = lane0 + laneByNet.get(pad.net)! * 1.6;
      traces.push({
        net: pad.net,
        kind: pad.kind,
        width: pad.kind === "i2c" || pad.kind === "uart" ? 0.3 : 0.25,
        layer: "top",
        points: [
          { x: src.x, y: src.y },
          { x, y: src.y },
        ],
      });
      traces.push({
        net: pad.net,
        kind: pad.kind,
        width: 0.25,
        layer: "bottom",
        points: [
          { x, y: src.y },
          { x, y: pad.y },
        ],
      });
      traces.push({
        net: pad.net,
        kind: pad.kind,
        width: 0.25,
        layer: "top",
        points: [
          { x, y: pad.y },
          { x: pad.x, y: pad.y },
        ],
      });
    }
  }

  // Keep the common-ground return below the signal routes, then bring each
  // header back on the reserved right-hand lane. These are drawn connections,
  // not copper-clearance or manufacturing verification.
  const groundY = height - 4;
  const groundX = width - 22;
  const groundTrace = (
    layer: Trace["layer"],
    a: Pad | { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    traces.push({ net: "GND", kind: "ground", width: 0.5, layer, points: [{ x: a.x, y: a.y }, b] });
  };
  for (const part of parts.slice(0, 2)) {
    const pad = part.pads.find((p) => p.net === "GND")!;
    const left = part.ref === "J1" ? 4 : 22;
    groundTrace("bottom", pad, { x: left, y: pad.y });
    groundTrace("bottom", { x: left, y: pad.y }, { x: left, y: groundY });
    groundTrace("bottom", { x: left, y: groundY }, { x: groundX, y: groundY });
  }
  for (const header of headers) {
    const pad = header.pads.find((p) => p.net === "GND")!;
    groundTrace("bottom", { x: groundX, y: groundY }, { x: groundX, y: pad.y });
    groundTrace("top", { x: groundX, y: pad.y }, { x: pad.x, y: pad.y });
  }

  const checks = boardChecks(plan, counts, width, height, parts, traces);
  return {
    name: projectName || "Breakout",
    width: round(width),
    height: round(height),
    parts,
    traces,
    checks,
  };
}

function boardChecks(
  plan: Plan,
  counts: Counts,
  width: number,
  height: number,
  parts: Comp[],
  traces: Trace[],
): Check[] {
  const checks: Check[] = [];
  const faults = plan.issues.filter((i) => i.level === "fault").length;
  checks.push(
    faults
      ? {
          level: "fail",
          title: "Wiring faults are still open",
          detail: `${faults} fault${faults === 1 ? "" : "s"} on the Wire bench. The route is drawn anyway. Do not power it, and do not order a board, until those are gone.`,
        }
      : {
          level: "pass",
          title: "No catalog wiring faults",
          detail:
            "The wiring planner found no hard faults in this parts selection. Physical wiring and input voltages still need review.",
        },
  );

  const pads = parts.flatMap((p) => p.pads);
  const signalNets = new Set(
    pads.filter((p) => p.kind !== "power" && p.kind !== "ground").map((p) => p.net),
  );
  const disconnected = disconnectedNets(parts, traces);
  const missing = [...signalNets].filter((n) => disconnected.has(n));
  checks.push(
    missing.length
      ? { level: "fail", title: "Unrouted nets", detail: missing.join(", ") }
      : {
          level: "pass",
          title: `${signalNets.size} signal net${signalNets.size === 1 ? "" : "s"} connected in drawing`,
          detail:
            "Each signal header has a continuous drawn path to the controller. Footprints, shorts and copper clearances are not validated.",
        },
  );

  checks.push(
    disconnected.has("GND")
      ? {
          level: "fail",
          title: "Ground connection is missing",
          detail: "At least one ground pad has no continuous return path in this drawing.",
        }
      : {
          level: "pass",
          title: "Common ground connected in drawing",
          detail: "The input, controller and all headers share a drawn ground return.",
        },
  );

  if (disconnected.has("VIN")) {
    checks.push({
      level: "fail",
      title: "Logic supply connection is missing",
      detail: "The logic input and controller are not connected in this drawing.",
    });
  }

  checks.push({
    level: "pass",
    title: "Servo current stays off this board",
    detail:
      "Headers carry signal and a ground pin. Pack current and servo plus stay on the BEC wires from the Wire bench, not on a thin trace.",
  });

  if (countOf(counts, "mg996") > 0) {
    checks.push({
      level: "warn",
      title: "MG996R still needs the 6 V BEC",
      detail:
        "The board does not feed those servos. Confirm the 6 V 5 A BEC on the Wire bench before a stall test.",
    });
  }

  const fits = width <= 100 && height <= 100;
  checks.push(
    fits
      ? {
          level: "pass",
          title: `Outline ${width.toFixed(0)} × ${height.toFixed(0)} mm`,
          detail:
            "The conceptual outline fits within 100 × 100 mm. Component footprints and fabrication clearances are not checked.",
        }
      : {
          level: "warn",
          title: `Outline ${width.toFixed(0)} × ${height.toFixed(0)} mm`,
          detail:
            "The conceptual outline exceeds 100 × 100 mm. Review the dimensions and placement in a PCB design tool.",
        },
  );

  checks.push({
    level: "warn",
    title: "Concept layout only",
    detail:
      "SVG drawings are not Gerber files. Sensor power, level shifting, real footprints, copper clearances and manufacturing checks need a PCB design tool and engineering review.",
  });

  if (countOf(counts, "bec6")) {
    checks.push({
      level: "warn",
      title: "Separate logic supply required",
      detail:
        "The 6 V BEC is for the servo rail. A USB or board-compatible logic supply is drawn separately; verify the controller's input rating.",
    });
  }

  if (plan.logic === "3.3" && countOf(counts, "hcsr04")) {
    checks.push({
      level: "fail",
      title: "Echo is still 5 V",
      detail:
        "The sonar header is routed, but Echo must not land on this 3.3 V pin until you add the divider from the Wire bench.",
    });
  }
  return checks;
}

/** Check drawn continuity, including shared branch points along a segment. */
function disconnectedNets(parts: Comp[], traces: Trace[]): Set<string> {
  const pads = parts.flatMap((part) => part.pads);
  const disconnected = new Set<string>();
  const key = (p: { x: number; y: number }) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
  const onSegment = (
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    return (
      Math.abs(cross) < 1e-6 &&
      p.x >= Math.min(a.x, b.x) - 1e-6 &&
      p.x <= Math.max(a.x, b.x) + 1e-6 &&
      p.y >= Math.min(a.y, b.y) - 1e-6 &&
      p.y <= Math.max(a.y, b.y) + 1e-6
    );
  };
  for (const net of new Set(pads.map((p) => p.net))) {
    const netPads = pads.filter((p) => p.net === net);
    const netTraces = traces.filter((t) => t.net === net);
    const points = [...netPads, ...netTraces.flatMap((t) => t.points)];
    const connected = new Set([key(netPads[0]!)]);
    let changed = true;
    while (changed) {
      const before = connected.size;
      for (const trace of netTraces) {
        for (let i = 1; i < trace.points.length; i++) {
          const a = trace.points[i - 1]!;
          const b = trace.points[i]!;
          const along = points.filter((p) => onSegment(p, a, b));
          if (along.some((p) => connected.has(key(p)))) along.forEach((p) => connected.add(key(p)));
        }
      }
      changed = connected.size > before;
    }
    if (netPads.some((p) => !connected.has(key(p)))) disconnected.add(net);
  }
  return disconnected;
}

function powerName(plan: Plan, counts: Counts): string {
  if (countOf(counts, "bec6")) return "USB / logic supply";
  if (countOf(counts, "bec5")) return "5 V BEC in";
  if (countOf(counts, "esc")) return "ESC BEC in";
  return plan.logic === "5" ? "USB 5 V" : "USB logic";
}

function layoutSchematic(projectName: string, plan: Plan, counts: Counts, sigs: Sig[]): Schematic {
  const pack = countOf(counts, "pack3s") ? "3S LiPo" : countOf(counts, "pack2s") ? "2S LiPo" : null;
  const bec = countOf(counts, "bec6")
    ? "6 V 5 A BEC"
    : countOf(counts, "bec5")
      ? "5 V 3 A BEC"
      : null;
  const left: { ref: string; name: string; sub: string; pins: string[] }[] = [];
  if (pack) left.push({ ref: "BT1", name: pack, sub: "battery input", pins: ["+", "GND"] });
  if (pack && countOf(counts, "switch"))
    left.push({
      ref: "SW1",
      name: "Series switch",
      sub: "positive lead only",
      pins: ["IN", "OUT"],
    });
  if (bec)
    left.push({
      ref: "U2",
      name: bec,
      sub: countOf(counts, "bec6") ? "external servo rail" : "regulated supply",
      pins: ["IN+", "OUT+", "GND"],
    });
  else if (countOf(counts, "esc"))
    left.push({
      ref: "U2",
      name: "ESC BEC",
      sub: "one red wire only",
      pins: ["IN+", "OUT+", "GND"],
    });
  const separateLogic = !left.some((b) => b.ref === "U2") || countOf(counts, "bec6") > 0;
  if (separateLogic)
    left.push({
      ref: "P1",
      name: "USB / logic supply",
      sub: "verify controller input",
      pins: ["+", "GND"],
    });

  const blocks: SchBlock[] = [];
  let ly = 36;
  for (const b of left) {
    const blk = block(
      b.ref,
      b.name,
      b.sub,
      28,
      ly,
      150,
      64,
      b.pins.map((name) => ({ name, side: "right" as const })),
    );
    blocks.push(blk);
    ly = blk.y + blk.h + 22;
  }

  const mcuNets: { name: string; side: "left" | "right" }[] = [
    { name: "VIN", side: "left" },
    { name: "GND", side: "left" },
  ];
  const seen = new Set<string>();
  for (const s of sigs) {
    for (const pin of s.pins) {
      if (seen.has(pin.net)) continue;
      seen.add(pin.net);
      mcuNets.push({ name: pin.net, side: "right" });
    }
  }
  const leftCount = mcuNets.filter((p) => p.side === "left").length;
  const rightCount = mcuNets.length - leftCount;
  const mcuH = Math.max(120, 36 + Math.max(leftCount, rightCount) * 18);
  const mcu = block(
    "U1",
    mcuName(plan.mcu),
    projectName || "breakout",
    300,
    36,
    210,
    mcuH,
    mcuNets,
  );
  blocks.push(mcu);

  let y = 36;
  sigs.forEach((s, i) => {
    const labels = [
      ...s.pins.map((p) => ({ name: p.name, side: "left" as const })),
      { name: "GND", side: "left" as const },
    ];
    const blk = block(`J${i + 2}`, s.name, s.kind, 700, y, 150, 64, labels);
    blocks.push(blk);
    y = blk.y + blk.h + 18;
  });

  const wires: SchWire[] = [];
  const findPin = (ref: string, name: string) =>
    blocks.find((b) => b.ref === ref)?.pins.find((p) => p.name === name);
  const connect = (a: SchPin | undefined, b: SchPin | undefined, kind: WireKind, net: string) => {
    if (a && b) wires.push({ kind, net, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  };
  const battery = findPin("BT1", "+");
  const switchIn = findPin("SW1", "IN");
  const switched = findPin("SW1", "OUT") ?? battery;
  connect(battery, switchIn, "power", "VBAT");
  connect(switched, findPin("U2", "IN+"), "power", "VBAT");
  const vin = mcu.pins.find((p) => p.name === "VIN");
  connect(separateLogic ? findPin("P1", "+") : findPin("U2", "OUT+"), vin, "power", "VIN");
  const ground = mcu.pins.find((p) => p.name === "GND");
  for (const source of left) connect(findPin(source.ref, "GND"), ground, "ground", "GND");

  sigs.forEach((s, i) => {
    const dest = blocks.find((b) => b.ref === `J${i + 2}`);
    s.pins.forEach((pin, pi) => {
      const src = mcu.pins.find((p) => p.name === pin.net);
      const dp = dest?.pins[pi];
      if (src && dp)
        wires.push({ kind: pin.kind, net: pin.net, x1: src.x, y1: src.y, x2: dp.x, y2: dp.y });
    });
    connect(
      ground,
      dest?.pins.find((p) => p.name === "GND"),
      "ground",
      "GND",
    );
  });

  const height = Math.max(...blocks.map((b) => b.y + b.h)) + 36;
  return { width: 880, height, blocks, wires };
}

function block(
  ref: string,
  name: string,
  sub: string,
  x: number,
  y: number,
  w: number,
  h: number,
  pinNames: { name: string; side: "left" | "right" }[],
): SchBlock {
  const left = pinNames.filter((p) => p.side === "left");
  const right = pinNames.filter((p) => p.side === "right");
  const pins: SchPin[] = [
    ...left.map((p, i) => ({ name: p.name, side: "left" as const, x, y: y + 56 + i * 18 })),
    ...right.map((p, i) => ({
      name: p.name,
      side: "right" as const,
      x: x + w,
      y: y + 56 + i * 18,
    })),
  ];
  const rows = Math.max(left.length, right.length, 1);
  return { ref, name, sub, x, y, w, h: Math.max(h, 68 + rows * 18), pins };
}

function layoutBom(plan: Plan, counts: Counts, board: Board): BomLine[] {
  const lines: BomLine[] = [
    {
      qty: 1,
      ref: "U1",
      part: mcuName(plan.mcu),
      note: "Logic only. Do not feed servos from the board pin.",
    },
    {
      qty: 1,
      ref: "PCB",
      part: `2-layer breakout, ${board.width.toFixed(0)} × ${board.height.toFixed(0)} mm`,
      note: "A placement drawing, not Gerber. Lay the same nets out in a fab tool before you order.",
    },
  ];
  const add = (id: DeviceId, ref: string, note: string) => {
    const n = countOf(counts, id);
    if (!n) return;
    const name =
      id === "pack2s"
        ? "2S LiPo"
        : id === "pack3s"
          ? "3S LiPo"
          : id === "bec5"
            ? "5 V 3 A BEC"
            : id === "bec6"
              ? "6 V 5 A BEC"
              : id === "switch"
                ? "Series switch"
                : id === "sg90"
                  ? "SG90 micro servo"
                  : id === "mg996"
                    ? "MG996R servo"
                    : id === "esc"
                      ? "30 A ESC"
                      : id === "drv8833"
                        ? "DRV8833 driver"
                        : id === "mpu6050"
                          ? "MPU6050 breakout"
                          : id === "bmp280"
                            ? "BMP280 breakout"
                            : id === "gps"
                              ? "NEO-6M GPS"
                              : id === "hcsr04"
                                ? "HC-SR04 sonar"
                                : "4-ch PWM receiver";
    lines.push({ qty: n, ref, part: name, note });
  };
  add("pack2s", "BT1", "Charge in a bag, off the airframe. Add a fuse on the positive.");
  add("pack3s", "BT1", "Charge in a bag, off the airframe. Add a fuse on the positive.");
  add("switch", "SW1", "On the pack positive, before the BEC.");
  add("bec5", "U2", "The only 5 V source if ESC red wires are cut.");
  add("bec6", "U2", "Use this for MG996R.");
  add("sg90", "M", "Signal to a header. Power from the BEC, not this board.");
  add("mg996", "M", "Signal to a header. Power from the 6 V BEC.");
  add(
    "esc",
    "M",
    "VBAT from the pack. Signal to a header. Cut the red wire when an external BEC is fitted.",
  );
  add("drv8833", "U3", "Motor supply from the pack, logic from the board.");
  add("mpu6050", "U4", "I2C 0x68.");
  add("bmp280", "U5", "I2C 0x76. 3.3 V only.");
  add("gps", "U6", "UART. RX on the module is not 5 V tolerant.");
  add("hcsr04", "U7", "Echo is a 5 V pulse.");
  add("receiver", "J", "Four pulse channels. Power from the BEC.");
  const headers = board.parts.filter((p) => p.ref.startsWith("J")).length;
  lines.push({
    qty: headers,
    ref: "J",
    part: "Pin headers, 2.54 mm",
    note: "One power pair plus one header per actuator or sensor.",
  });
  return lines;
}

export function bomCsv(lines: BomLine[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [
    "qty,ref,part,note",
    ...lines.map((l) => [l.qty, l.ref, esc(l.part), esc(l.note)].join(",")),
  ].join("\n");
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
