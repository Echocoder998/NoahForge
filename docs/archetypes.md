# Archetype-aware engineering

Choose the engineering archetype in Mission & requirements > Robot archetype.
Supported types: multirotor, fixed_wing, hexapod, quadruped, biped, humanoid, rover.
Navigation, mission estimates, safety notices, the calculators hub, AI design
context, and exported calculation summaries use this persisted choice.
AI proposals include archetype metadata; accepting one updates the project.
Legacy saves infer their archetype from their template and retain all BOM rows.
Named projects, restore points, JSON import/export and Neon cloud saves include
archetypes and calculator inputs. Account authentication remains required.

## State and binding

`engineering.archetype` selects the model. `engineering.sizing` stores actuator,
wheel, gearbox, current-limit and efficiency inputs. Leg geometry remains in
`engineering.leg`. Battery and canonical mass/cost rows retain their legacy
`engineering.flight` paths so existing saves are not duplicated or discarded.
These paths do not select the physics model. `analyzeProject` computes results;
results are derived rather than cached, preventing stale budget/runtime outputs.

With automatic BOM linking enabled, leg count x DoF + additional actuators, or
drive/rotor motor count, updates the single `propulsion` row using entered unit
mass and cost. Editing that row's totals updates unit inputs in the other
direction. Other BOM rows are preserved. Linking can be turned off for manual
budgets. Demand is compared against the entered power/bus limit; the calculator
does not silently raise that design limit. Planning actuator counts do not
allocate controller pins or change wiring catalog limits. Review those separately.

Archetype changes preserve notebook, mission targets and other inputs. They
set a matching leg count for walking types. The procedural 3D template remains
a visual reference; changing engineering archetype does not synthesize geometry.

## Models and units

- Walking: static joint torque is total weight / supporting legs x maximum link
  reach x service factor. N m x 100 = N cm. Supporting legs is floor(leg count x
  stance fraction), minimum 1. Continuous/peak bus currents sum all actuators plus
  electronics. Runtime uses pack Wh divided by servo-bus W / converter efficiency.
  Speed is stride length / cycle period. This is a planning model, not a dynamic
  stability simulation; biped/humanoid balancing and impact loads require testing.
- Multirotor: combined maximum thrust / mass, with a 2:1 planning target. Hover
  time uses usable Ah / entered total hover current x 60. Disk loading and ideal
  induced hover power are aerodynamic estimates; ideal power is a lower bound,
  not a substitute for measured current. Use matched test voltage and propellers.
- Fixed wing: cruise endurance uses measured cruise + electronics current.
  Stall speed is sqrt(2 W / rho S CLmax), where g -> kg and dm2 -> m2 conversions
  are explicit. See [NASA's lift equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-equation-2/).
- Rover: force = m g (sin(slope) + Crr cos(slope)). Wheel torque = force x radius /
  driven wheel count x service factor. Motor torque divides by gear reduction and
  efficiency. Speed uses loaded motor RPM / reduction x circumference / 60.
  Electrical power includes incline/rolling work and entered idle losses; range
  assumes constant slope and speed. Traction compares demand to mu m g cos(slope).
  Motor torque-speed limits, terrain variation, acceleration and battery sag need
  measured verification. Gearbox relation: [gearbox terminology](https://forum.pololu.com/uploads/default/original/2X/a/ada280a22bfdcb1fa2a0ff4545b1258af2c9a775.pdf).

Zero current produces undefined endurance, not Infinity. Starting values are
planning assumptions, not measured hardware data. CSV export and calculation
notebook records retain the relevant model's results and warnings.
