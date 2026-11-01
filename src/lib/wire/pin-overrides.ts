import type { McuId } from "./catalog";
import type { Plan } from "./plan";

const OUTPUTS: Record<McuId, string[]> = {
  uno: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "A0", "A1", "A2", "A3"],
  esp32: ["4", "5", "13", "14", "16", "17", "18", "19", "23", "25", "26", "27", "32", "33"],
  teensy40: [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "14",
    "15",
    "20",
    "21",
    "22",
    "23",
  ],
};
const PWM: Record<McuId, string[]> = {
  uno: ["3", "5", "6", "9", "10", "11"],
  esp32: OUTPUTS.esp32,
  teensy40: ["2", "3", "4", "5", "6", "9", "10", "11", "12", "14", "15"],
};
export function availableSignalPins(mcu: McuId): string[] {
  return [...OUTPUTS[mcu]];
}

/** Apply valid remaps atomically so diagrams and firmware always agree. */
export function applyPinOverrides(base: Plan, overrides: Record<string, string>): Plan {
  const entries = Object.entries(overrides).filter(([from, to]) => from !== to);
  if (!entries.length) return base;
  const issues: Plan["issues"] = [];
  const signals = new Set(base.pins.filter((pin) => pin.kind === "signal").map((pin) => pin.pin));
  const map = (pin: string) => (signals.has(pin) ? (overrides[pin] ?? pin) : pin);
  for (const [from, to] of entries) {
    if (!signals.has(from) || !OUTPUTS[base.mcu].includes(to))
      issues.push({
        level: "fault",
        title: "Invalid manual pin assignment",
        detail:
          "An assignment contains an unsupported source or destination. Only listed digital signal pins are editable; I²C and UART stay fixed.",
      });
    if (base.drv && Object.values(base.drv).includes(from) && !PWM[base.mcu].includes(to))
      issues.push({
        level: "fault",
        title: "Motor driver needs a PWM-capable pin",
        detail: "Choose a supported hardware-PWM pin for every motor-driver output.",
      });
    if (to === base.led)
      issues.push({
        level: "fault",
        title: "Manual assignment conflicts with status LED",
        detail: `The starter firmware reserves pin ${base.led} for its status LED.`,
      });
  }
  if (issues.length)
    return {
      ...base,
      issues: [
        ...base.issues,
        ...issues,
        {
          level: "caution",
          title: "Manual assignments were not applied",
          detail:
            "The automatic wiring and firmware remain in use until all manual assignments are valid.",
        },
      ],
    };
  const uses = new Map<string, Set<string>>();
  for (const pin of base.pins) {
    const target = map(pin.pin);
    const destinations = uses.get(target) ?? new Set();
    destinations.add(pin.goesTo);
    uses.set(target, destinations);
  }
  for (const [pin, destinations] of uses)
    if (destinations.size > 1)
      issues.push({
        level: "fault",
        title: `Manual pin ${pin} is assigned twice`,
        detail: [...destinations].join("; ") + ". Choose distinct pins or reset the overrides.",
      });
  if (issues.length)
    return {
      ...base,
      issues: [
        ...base.issues,
        ...issues,
        {
          level: "caution",
          title: "Manual assignments were not applied",
          detail:
            "The automatic wiring and firmware remain in use until all manual assignments are valid.",
        },
      ],
    };
  const pins = base.pins.map((pin) => ({ ...pin, pin: map(pin.pin) }));
  const replace = (text: string) =>
    text.replace(/\bD(A\d|\d+)\b/g, (match, pin: string) =>
      signals.has(pin) ? `D${map(pin)}` : match,
    );
  return {
    ...base,
    pins,
    wires: base.wires.map((wire) => ({ ...wire, from: replace(wire.from), to: replace(wire.to) })),
    servos: base.servos.map((part) => ({ ...part, pin: map(part.pin) })),
    escs: base.escs.map((part) => ({ ...part, pin: map(part.pin) })),
    drv: base.drv
      ? {
          in1: map(base.drv.in1),
          in2: map(base.drv.in2),
          in3: map(base.drv.in3),
          in4: map(base.drv.in4),
        }
      : null,
    sonar: base.sonar ? { trig: map(base.sonar.trig), echo: map(base.sonar.echo) } : null,
    receiver: base.receiver
      ? {
          ail: map(base.receiver.ail),
          ele: map(base.receiver.ele),
          thr: map(base.receiver.thr),
          rud: map(base.receiver.rud),
        }
      : null,
    issues: [
      ...base.issues,
      {
        level: "caution",
        title: "Manual signal assignments in use",
        detail:
          "Confirm controller pin capabilities, timer usage, and the physical wiring before testing.",
      },
    ],
  };
}
