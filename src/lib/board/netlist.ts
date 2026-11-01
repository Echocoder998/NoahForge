import type { Board } from "./build";

const quoted = (value: string) =>
  `"${value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')}"`;

/** Stable IDs keep connectivity updates associated with each reference. */
function componentId(ref: string): string {
  const hex = Array.from({ length: 4 }, (_, seed) => {
    let hash = 2166136261 ^ seed;
    for (const char of `Noah Forge/${ref}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return (hash >>> 0).toString(16).padStart(8, "0");
  }).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

/** Native KiCad S-expression netlist; generic pins require real footprint mapping. */
export function kicadNetlist(board: Board, projectName: string): string {
  const nets = new Map<string, { ref: string; pin: string; name: string }[]>();
  for (const part of board.parts)
    for (const [index, pad] of part.pads.entries()) {
      const nodes = nets.get(pad.net) ?? [];
      nodes.push({ ref: part.ref, pin: String(index + 1), name: pad.name });
      nets.set(pad.net, nodes);
    }
  return `(export (version "E")
  (design (source ${quoted(projectName)}) (tool "Noah Forge generic breakout connectivity"))
  (components
${board.parts
  .map(
    (part) => `    (comp (ref ${quoted(part.ref)})
      (value ${quoted(part.name)}) (footprint "")
      (property (name "Review") (value "Generic numbered pins; assign and verify actual footprints and physical pin mapping before layout"))
      (sheetpath (names "/") (tstamps "/"))
      (tstamps "${componentId(part.ref)}"))`,
  )
  .join("\n")}
  )
  (nets
${[...nets]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(
    ([name, nodes], index) =>
      `    (net (code ${index + 1}) (name ${quoted(name)})\n${nodes.map((node) => `      (node (ref ${quoted(node.ref)}) (pin ${quoted(node.pin)}) (pinfunction ${quoted(node.name)}) (pintype "passive"))`).join("\n")})`,
  )
  .join("\n")}
  )
)
`;
}
