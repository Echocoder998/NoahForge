import type { WireKind } from "../wire/plan";
import type { Board, Schematic } from "./build";

const STROKE: Record<WireKind, string> = {
  power: "#ff5df4",
  ground: "#8ea0c0",
  signal: "#26e7ff",
  i2c: "#24f7ca",
  uart: "#a855ff",
};

export function boardSvg(board: Board): string {
  const w = board.width;
  const h = board.height;
  const pour = `<rect x="1.2" y="1.2" width="${w - 2.4}" height="${h - 2.4}" fill="#123028" opacity="0.85"/>`;
  const slots = board.traces
    .filter((t) => t.layer === "bottom")
    .map((t) => {
      const [a, b] = t.points;
      if (!a || !b) return "";
      const x = Math.min(a.x, b.x) - 0.45;
      const y = Math.min(a.y, b.y) - 0.45;
      return `<rect x="${x}" y="${y}" width="${Math.abs(b.x - a.x) + 0.9}" height="${Math.abs(b.y - a.y) + 0.9}" fill="#143028"/>`;
    })
    .join("");
  const traces = board.traces
    .map((t) => {
      const d = t.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
      const color = t.layer === "bottom" ? "#c4552a" : STROKE[t.kind];
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${t.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  const vias = board.traces
    .filter((t) => t.layer === "bottom")
    .flatMap((t) => t.points)
    .map(
      (p) =>
        `<circle cx="${p.x}" cy="${p.y}" r="0.55" fill="#f5f8ff" stroke="#26e7ff" stroke-width="0.2"/>`,
    )
    .join("");
  const parts = board.parts
    .map((p) => {
      const pads = p.pads
        .map(
          (pad) =>
            `<circle cx="${pad.x}" cy="${pad.y}" r="0.7" fill="#e8c56b"/><text x="${pad.x + 1.1}" y="${pad.y + 0.4}" fill="#9fb0cc" font-size="1.7" font-family="ui-sans-serif">${escapeXml(pad.name)}</text>`,
        )
        .join("");
      return `<g><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="none" stroke="#d7e4ff" stroke-width="0.25"/><text x="${p.x + 1}" y="${p.y - 0.6}" fill="#d7e4ff" font-size="1.7" font-family="ui-sans-serif">${p.ref} ${escapeXml(p.name)}</text>${pads}</g>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -6 ${w + 10} ${h + 16}" width="${(w + 10) * 6}" height="${(h + 16) * 6}">
  <title>${escapeXml(board.name)} concept layout</title>
  <desc>Concept drawing only, not fabrication data. Footprints, copper clearances and electrical behavior require engineering review.</desc>
  <rect x="-4" y="-6" width="${w + 10}" height="${h + 16}" fill="#07110e"/>
  <rect x="0" y="0" width="${w}" height="${h}" rx="2" fill="#0c3b32" stroke="#1ee0a0" stroke-width="0.4"/>
  ${pour}${slots}${traces}${vias}${parts}
  <text x="0" y="${h + 4}" fill="#9fb0cc" font-size="2.2" font-family="ui-sans-serif">${escapeXml(board.name)} · concept layout</text>
  <text x="0" y="${h + 7}" fill="#9fb0cc" font-size="1.8" font-family="ui-sans-serif">Not Gerber. Verify footprints, supply voltages and copper clearances.</text>
</svg>`;
}

export function schematicSvg(sch: Schematic, title: string): string {
  const wires = sch.wires
    .map((w, i) => {
      const mid = w.x1 + 28 + (i % 6) * 6;
      const d = `M${w.x1} ${w.y1} H${mid} V${w.y2} H${w.x2}`;
      return `<path d="${d}" fill="none" stroke="${STROKE[w.kind]}" stroke-width="1.6"/>`;
    })
    .join("");
  const blocks = sch.blocks
    .map((b) => {
      const pins = b.pins
        .map((p) => {
          const anchor = p.side === "left" ? "start" : "end";
          const tx = p.side === "left" ? p.x + 8 : p.x - 8;
          return `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#26e7ff"/><text x="${tx}" y="${p.y + 3}" text-anchor="${anchor}" fill="#d5def2" font-size="10" font-family="ui-sans-serif">${escapeXml(p.name)}</text>`;
        })
        .join("");
      return `<g><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" fill="#141b3a" stroke="#26e7ff" stroke-width="1.2"/><text x="${b.x + 10}" y="${b.y + 16}" fill="#24f7ca" font-size="10" font-family="ui-sans-serif">${b.ref}</text><text x="${b.x + 10}" y="${b.y + 32}" fill="#f5f8ff" font-size="13" font-family="ui-sans-serif">${escapeXml(b.name)}</text>${pins}</g>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sch.width} ${sch.height}" width="${sch.width}" height="${sch.height}">
  <title>${escapeXml(title)} concept schematic</title>
  <desc>Concept connections only. Sensor power, level shifting and physical wiring require engineering review.</desc>
  <rect width="100%" height="100%" fill="#070913"/>
  <text x="36" y="24" fill="#f5f8ff" font-size="16" font-family="ui-sans-serif">${escapeXml(title)} schematic</text>
  ${wires}${blocks}
  <text x="28" y="${sch.height - 10}" fill="#9fb0cc" font-size="10" font-family="ui-sans-serif">Concept schematic. Verify power, level shifting and physical wiring before building.</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[&<>]/g, (c) =>
    c === "&" ? "\u0026amp;" : c === "<" ? "\u0026lt;" : "\u0026gt;",
  );
}
