# Noah Forge engineering upgrade

Preserve the existing AI designer, five chassis templates and custom machines, interactive assembly bay, all five printable part families, STL downloads, component catalog, wiring/pin checks, schematic/PCB views, net inspection, SVG/BOM exports, firmware templates/copy/download, notes, and restore points.

Add alongside those tools:

1. Mission brief with measurable requirements, limits, verification methods, evidence, and project reports.
2. A two/three-joint leg workbench: inverse kinematics, reachable targets, limits, gait timing, supporting feet, center of mass, and static torque estimates.
3. Flight sizing with sourced mass/cost and thrust inputs, center of mass, current/runtime estimates, thrust-to-weight, wing loading, and stall-speed assumptions.
4. Mechanical mounting assembly with shared dimensions, clearance/fastener checks, material estimates, STL and CAD reference exports.
5. Notebook for decisions, failures, tests, predicted versus measured values, photographs, revisions, and report export.
6. Named local projects, complete validated project import/export, and backups covering both old and new data.
7. University-level AI coaching with project context, reviewable proposed changes, and undo.
8. Precision NF emblem from the supplied image folder and the official Alabama A&M maroon (#61162D), white, and rich-black palette.

Shared contract: new `EngineeringProject` data lives inside the existing Zustand project and snapshots. Modules own non-overlapping new component/math files; the integration owner owns the shell, main store, theme, AI wiring, and project persistence. Existing route and environment contracts remain intact. Auth and database remain off.

Verification: numerical edge-case/regression tests for new calculations and import/storage migration; preserve and expand existing browser workflows; desktop/mobile visual checks; development and production build checks with clean consoles. Distinguish kinematic/static/analytical models from experimentally validated hardware and flight dynamics. Never invent measured data or datasheet citations.

## Implemented behavior

All eight additions above have working controls and project persistence. The mechanical assembly produces a closed plate/column solid and exports STL, OpenSCAD source, DXF and hardware CSV. Signal-pin overrides update the wiring list, schematic, breakout and firmware atomically; unsupported or conflicting assignments keep the automatic plan and display faults. A native KiCad S-expression netlist provides generic connectivity for assigning real footprints in CAD. Its structure follows the [official KiCad reader](https://github.com/KiCad/kicad-source-mirror/blob/master/pcbnew/netlist_reader/kicad_netlist_reader.cpp); a desktop KiCad import has not been exercised here.

Complete engineering projects and photos use browser IndexedDB, with migration from the previous localStorage format and a small-save mirror. Named projects and restore points include the old machine/parts/electronics data and new engineering sections. Imports are bounded and schema-validated before replacing live work; the outgoing setup is backed up first.

The assistant now uses university-level explanations, mission/mechanical context, coaching modes, reviewed change proposals, stale-response protection, and undo. Live provider generation still requires the existing server-side Anthropic credential; the configured-error path is tested without a paid request.

Regression coverage explicitly includes all five original machine templates and their controls, all five original STL part families, the old catalog and wiring checks, schematic/PCB net inspection and exports, firmware synchronization, browser persistence, new calculations/exports, and complete project recovery. Numerical models are planning tools: dynamic walking/flight, stress/fatigue, physical clearance and real PCB footprints need dedicated analysis and hardware validation.

## Verification completed

- Production build and TypeScript checks pass.
- 73 workspace/calculation/import/connectivity tests and 79 tooling regression tests pass.
- Desktop and mobile render checks pass for development and built output, with no uncaught browser errors, broken images, horizontal overflow or brand warnings.
- Original workflows, the new engineering workflows, and recovery edge cases pass browser checks. Same-project restore/reopen resets drafts and pending Undo; replacement records cannot bypass notebook or requirement limits.
- Live AI generation was not called without credentials. The existing missing-key error path preserves the project and displays setup guidance.

Brand palette reference: [Alabama A&M University brand guidelines](https://www.aamu.edu/about/administrative-offices/marketing-communication-advancement/marketing-public-relations/brand-guidelines.html). The header uses the supplied Precision NF image without regenerating the artwork.
