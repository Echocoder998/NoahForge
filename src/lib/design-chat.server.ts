import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { SKETCHES } from "./code/sketches";
import { DesignReply, MAX_PARTS, type DesignOutputT } from "./robots/design";
import { DEVICES, MCUS } from "./wire/catalog";

export const DESIGN_MODEL = "claude-sonnet-5-5";

export type ChatInput = {
  messages: { role: "user" | "assistant"; text: string }[];
  current: DesignOutputT | null;
  faults: string[];
};

export type ChatResult =
  | { ok: true; reply: string; changed: boolean; design: DesignOutputT }
  | { ok: false; error: string };

// Stable text only, so the prompt cache can reuse it on every turn.
const SYSTEM = `You are the Noah Forge design assistant. You help a student design small robots and RC machines in Noah Forge, a build planner. The student describes a machine; you return a design the app draws in 3D, wires, and turns into a starter Arduino sketch from a fixed template.

How the 3D bay works
- Units are roughly meters at toy scale. y is up, the floor is y = 0, the front of the machine faces -z, +x is the machine's right.
- For reference: the built-in plane is 2.15 wide and 1.1 long; the quadcopter is about 1.2 across; the humanoid is about 1.3 tall; the hex walker body is about 0.8 long.
- Build the shape from ${MAX_PARTS} or fewer parts (boxes, cylinders, spheres). Cylinders stand upright along y before rotation; rotate 90 degrees about z to make an axle along x (a wheel), or about x to point one along z.
- finish: "body" is the printed plastic, "dark" is motors, electronics and tires, "accent" is props, sensors and highlights.
- animate: "spin" for propellers and rotors, "wheel" for wheels and tracks, "swing" and "swing-opposite" for legs or arms that alternate. "axis" is the axis in machine space the part turns around (wheel axle along x means axis "x"; a quad prop spins about "y"). "pivot" is the joint: the hip or shoulder for limbs, the part's own center for wheels and props. Non-moving parts use animate "none" and pivot equal to pos.
- 12 to 30 parts usually reads well. Keep everything within 3 of the origin.

motion
- "plane": fixed wing. "hover": multirotor or helicopter. "ground": wheels, tracks, or legs. "fixed": stays in place, like an arm or turret.

Electronics: choose only from this catalog
Boards (mcu):
${MCUS.map((m) => `- ${m.id}: ${m.name}. ${m.blurb}`).join("\n")}
Devices (id, max count):
${DEVICES.map((d) => `- ${d.id} (max ${d.max}): ${d.name}. ${d.blurb}`).join("\n")}

Wiring rules the app checks (a design that breaks them shows faults to the student)
- Exactly one battery: pack2s or pack3s, always with the series switch.
- Servos run from a BEC (bec5 or bec6), never from the board's 5 V pin. MG996R servos need bec6.
- 3S is too high for servos and the DRV8833 motor driver; pair those with 2S.
- When an external BEC powers the rail, the ESC red wires are cut.
- The Uno runs out of PWM pins quickly; use the Teensy 4.0 for more than about 6 servos plus ESCs.
- servoNames must have one entry per servo (sg90 + mg996 count); motorNames one per ESC. Labels are short words like "shoulder" or "left drive", each different.

Starter sketches (pick the closest; the student reads it before flashing):
${SKETCHES.map((s) => `- ${s.id}: ${s.name}. ${s.blurb}`).join("\n")}

printPart is the one printable piece the Print bench shows: rib (wing rib), motor (motor mount), horn (servo horn), plate (flat mounting plate), clip (wire clip).

How to answer
- The student is young. Keep "reply" to two to four short sentences: what you built or changed and one thing to check next. No code, no markdown.
- If the student asks a question without asking for a change, answer it, set changed to false, and return the current design unchanged.
- When a design already exists, change only what the student asked for and keep the rest the same.
- If wiring faults are listed, fix them when you change the design and say what you fixed.
- Never suggest skipping the props-off rule, removing the switch, or powering servos from the board. Lithium packs are charged in a fire-safe bag, off the airframe.
- If the request is not a machine (or not something a student should build), say so kindly and return the current design, or a simple rover if there is none.`;

export async function runDesignChat(input: ChatInput): Promise<ChatResult> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return { ok: false, error: "Noah Forge's designer isn't set up yet: the ANTHROPIC_API_KEY setting is missing on the server." };
  }

  const history = input.messages.filter((m) => m.text.trim());
  while (history.length && history[0]!.role !== "user") history.shift();
  const last = history.at(-1);
  if (!last || last.role !== "user") return { ok: false, error: "Type a message first." };

  const context = [
    input.current
      ? `Current design (JSON):\n${JSON.stringify(input.current)}`
      : "There is no design yet. Create one from my message.",
    input.faults.length ? `Wiring check faults right now:\n${input.faults.map((f) => `- ${f}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m, i) => ({
    role: m.role,
    content: i === history.length - 1 ? `${m.text}\n\n---\n${context}` : m.text,
  }));

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: DESIGN_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: SYSTEM,
      messages,
      output_config: { effort: "medium", format: betaZodOutputFormat(DesignReply) },
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "The designer declined that one. Try describing the machine differently." };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, error: "That design got too big to finish. Ask for something with fewer parts." };
    }
    const out = response.parsed_output;
    if (!out) return { ok: false, error: "The designer's answer didn't come back in the right shape. Try again." };
    return { ok: true, reply: out.reply, changed: out.changed, design: out.design };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "The Anthropic API key was rejected. Check the ANTHROPIC_API_KEY setting." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Too many requests at once. Wait a minute and try again." };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return { ok: false, error: "Couldn't reach the designer. Check the connection and try again." };
    }
    if (err instanceof Anthropic.APIError) {
      // A 400 here is usually an empty credit balance; the API says so in the message.
      return { ok: false, error: `The designer couldn't answer (${err.status ?? "error"}): ${err.message}` };
    }
    throw err;
  }
}
