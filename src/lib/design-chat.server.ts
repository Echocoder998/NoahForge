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
  engineeringContext?: string;
  coachingMode?: "explain" | "hint" | "design";
};

export type ChatResult =
  | { ok: true; reply: string; changed: boolean; design: DesignOutputT }
  | { ok: false; error: string };

// Stable text only, so the prompt cache can reuse it on every turn.
const SYSTEM = `You are the Noah Forge engineering design assistant for a university mechanical engineering student experienced with rover projects and interested in aeronautical and insectoid robotics. Treat the user as a capable engineering collaborator. Explain assumptions, equations, units, tradeoffs, and verification steps at the requested depth. The app draws robot concepts in 3D, checks catalog wiring, and supplies starter firmware templates.

Engineering workspaces
- Always include the correct design archetype: multirotor, fixed_wing, hexapod, quadruped, biped, humanoid, rover. Preserve the current archetype on incremental edits; change it when explicitly creating a different robot type. Use walking joint/bus/gait calculations for legged robots, wheel torque/traction/range for rovers, and aircraft models only for aerial types. Never apply hover equations or propeller warnings to ground robots.
- Mission defines requirements and verification evidence. Legs & gait solves inverse kinematics and static support/torque; Flight sizing estimates mass, COM, thrust-to-weight, runtime and wing loading; Mechanical assembly exports mounting geometry; Notebook compares predictions with measurements.
- Use the supplied engineering context as user inputs, not experimentally established facts. Never invent measured results, test curves, certification, sources or datasheet URLs. Reference provided component sources; identify anything requiring a datasheet or physical test.
- Geometry animation is not validated flight dynamics. Kinematic gait previews do not establish dynamic stability. Static torque estimates do not prove a servo's continuous capability. Board SVGs are conceptual and are not Gerber fabrication data.
- In hint mode, guide the reasoning without modifying the design (changed=false). In explain mode, answer questions without modifications unless explicitly requested. In design mode, propose only requested edits. The app presents proposals for review before applying them.

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

The Board tab is already in the app. It draws the schematic, routes a 2-layer signal breakout, lists parts, and runs checks from the wiring plan. You do not design that board yourself. If the student asks to route, show a schematic, or list parts, tell them the Board tab does it from the current machine, and still return the design.

How to answer
- Give a clear engineering explanation, with equations and units when useful. Distinguish calculations from assumptions and measured evidence. Keep routine replies concise, and expand when the user asks for analysis. No firmware code: the app provides reviewed starter templates.
- If the student asks a question without asking for a change, answer it, set changed to false, and return the current design unchanged.
- When a design already exists, change only what the student asked for and keep the rest the same.
- If wiring faults are listed, fix them when you change the design and say what you fixed.
- Never suggest skipping the props-off rule, removing the switch, or powering servos from the board. Lithium packs are charged in a fire-safe bag, off the airframe.
- If the request is not a machine (or not something a student should build), say so kindly and return the current design, or a simple rover if there is none.`;

export async function runDesignChat(input: ChatInput): Promise<ChatResult> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return {
      ok: false,
      error:
        "Noah Forge's designer isn't set up yet: the ANTHROPIC_API_KEY setting is missing on the server.",
    };
  }

  const history = input.messages.filter((m) => m.text.trim());
  while (history.length && history[0]!.role !== "user") history.shift();
  const last = history.at(-1);
  if (!last || last.role !== "user") return { ok: false, error: "Type a message first." };

  const context = [
    input.current
      ? `Current design (JSON):\n${JSON.stringify(input.current)}`
      : "There is no design yet. Create one from my message.",
    input.faults.length
      ? `Wiring check faults right now:\n${input.faults.map((f) => `- ${f}`).join("\n")}`
      : "",
    input.engineeringContext
      ? `Engineering inputs and notebook summary:\n${input.engineeringContext}`
      : "",
    `Coaching mode: ${input.coachingMode || "explain"}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m, i) => ({
    role: m.role,
    content: i === history.length - 1 ? `${m.text}\n\n---\n${context}` : m.text,
  }));

  const client = new Anthropic({ timeout: 60000, maxRetries: 0 });
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
      return {
        ok: false,
        error: "The designer declined that one. Try describing the machine differently.",
      };
    }
    if (response.stop_reason === "max_tokens") {
      return {
        ok: false,
        error: "That design got too big to finish. Ask for something with fewer parts.",
      };
    }
    const out = response.parsed_output;
    if (!out)
      return {
        ok: false,
        error: "The designer's answer didn't come back in the right shape. Try again.",
      };
    return { ok: true, reply: out.reply, changed: out.changed, design: out.design };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return {
        ok: false,
        error: "The Anthropic API key was rejected. Check the ANTHROPIC_API_KEY setting.",
      };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Too many requests at once. Wait a minute and try again." };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return {
        ok: false,
        error: "Couldn't reach the designer. Check the connection and try again.",
      };
    }
    if (err instanceof Anthropic.APIError) {
      // A 400 here is usually an empty credit balance; the API says so in the message.
      return {
        ok: false,
        error: `The design service could not complete this request (${err.status ?? "service error"}). Your project is unchanged. Check the service configuration or try again.`,
      };
    }
    throw err;
  }
}
