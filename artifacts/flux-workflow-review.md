# Noah Forge workflow review

The existing app is a TanStack Start workspace with a locally persisted project, an AI design assistant, procedural assemblies, printable parts, wiring plans, circuit drawings, a conceptual PCB breakout, and starter firmware. The review used [Flux's product workflow](https://www.flux.ai/p) as a reference for connecting an idea to a design and a reviewable prototype.

## Changes implemented

| Previous behavior | Updated behavior | Purpose |
| --- | --- | --- |
| Six equal tabs with short, ambiguous names | Grouped navigation for Overview & AI, Components, Schematic, PCB layout, 3D assembly, Printable parts, and Firmware | Make the next task discoverable |
| Presets replace the live setup immediately | A deliberate project picker backs up the outgoing setup; up to 12 restore points and JSON downloads | Protect work while exploring templates |
| Manual custom-design edits disappear when reopened | Names, controllers, devices, print selection, and firmware stay synchronized with the saved design | Prevent data loss |
| Large unfiltered component catalog | Search, category filters, selected-only view, empty states, accessible quantity controls | Find and adjust parts quickly |
| Unlabeled net selection and crowded board sidebar | Shared selected nets, connection details, clear selection, zoom/fit, and Checks / Parts / Nets inspector | Inspect the actual circuit |
| “Route this board” replays a generated drawing | “Regenerate layout” and explicit conceptual SVG/CSV exports | Accurately describe the capability |
| Missing ground paths and shared-net lane allocation errors | Continuous ground drawings, shared I2C lanes, continuity checks, explicit logic supply paths | Improve drawing correctness |
| AI starts without built-in project context | Live controller, devices, labels, and faults accompany requests; suggestions are editable | Connect the assistant to the project |
| Late AI responses can replace a switched project | Keep pending state across workspace navigation and reject stale responses, including restored geometry revisions | Preserve current edits and prevent duplicate requests |
| Bright gradients and glowing controls | Graphite surfaces, restrained accent, clearer type and focus hierarchy | Reduce visual noise |

## Boundaries and recommended next work

- Board drawings remain conceptual references. They are not an editable PCB CAD model or fabrication-ready Gerber files. Footprints, physical clearance, sensor supply routing, level shifting, and manufacturing rules require a dedicated PCB implementation.
- Live AI generation uses the existing Anthropic integration and requires its server credential. This environment has no configured credential; the visible setup error was verified without a paid provider request.
- Projects and restore points remain local to the browser. Cross-device projects and collaboration would require an explicit account and storage workflow.
- A next functional milestone is an editable component/net model with undo/redo, followed by verified footprints and manufacturing exports. Live sourcing and simulation should follow their own real integrations.

## Verification

Focused tests cover routing connectivity and project restoration/persistence. Desktop/mobile browser checks exercise component editing, cross-view net selection, zoom, SVG/BOM downloads, template backups, reload persistence, firmware synchronization, and assembly rendering/controls. Build and type checks are run against the final source; the production output is checked separately from the development view.
