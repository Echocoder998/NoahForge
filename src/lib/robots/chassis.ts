import type { PartKind } from "../aero/parts";
import type { SketchId } from "../code/sketches";
import type { DeviceId, McuId } from "../wire/catalog";

export type ChassisId = "plane" | "drone" | "heli" | "spider" | "humanoid";

export type ChassisPreset = {
  id: ChassisId;
  name: string;
  blurb: string;
  drive: string;
  projectName: string;
  part: PartKind;
  mcu: McuId;
  sketch: SketchId;
  legs: 6 | 8;
  picked: Partial<Record<DeviceId, number>>;
};

export const CHASSIS: ChassisPreset[] = [
  {
    id: "plane",
    name: "Plane",
    blurb: "Fixed wing. Elevons on a 5 V rail from the ESC, motor signal separate.",
    drive: "W nose up, S nose down, A bank left, D bank right. Space adds throttle, C takes it off.",
    projectName: "Yard wing",
    part: "rib",
    mcu: "uno",
    sketch: "mixer",
    legs: 6,
    picked: { pack2s: 1, switch: 1, sg90: 2, esc: 1, mpu6050: 1, receiver: 1 },
  },
  {
    id: "drone",
    name: "Drone",
    blurb: "Quad in X. Four ESCs, one external BEC, red wires cut on every ESC.",
    drive: "W forward, S back, A yaw left, D yaw right. Space climbs, C descends.",
    projectName: "Yard quad",
    part: "motor",
    mcu: "esp32",
    sketch: "quad",
    legs: 6,
    picked: { pack3s: 1, switch: 1, bec5: 1, esc: 4, mpu6050: 1, receiver: 1 },
  },
  {
    id: "heli",
    name: "Helicopter",
    blurb: "Swash roll, swash pitch, collective, and a tail servo. One main ESC.",
    drive: "W forward, S back, A yaw left, D yaw right. Space climbs, C descends.",
    projectName: "Swash trainer",
    part: "horn",
    mcu: "uno",
    sketch: "swash",
    legs: 6,
    picked: { pack2s: 1, switch: 1, sg90: 4, esc: 1, mpu6050: 1, receiver: 1 },
  },
  {
    id: "spider",
    name: "Spider",
    blurb: "One servo per leg on a 6 V BEC. A second joint is the next print.",
    drive: "W forward, S back, A turn left, D turn right.",
    projectName: "Hex walker",
    part: "plate",
    mcu: "teensy40",
    sketch: "gait",
    legs: 6,
    picked: { pack2s: 1, switch: 1, bec6: 1, sg90: 6, mpu6050: 1 },
  },
  {
    id: "humanoid",
    name: "Humanoid",
    blurb: "Hips, knees, ankles, and shoulders. Teensy, because an Uno runs out of pins.",
    drive: "W forward, S back, A turn left, D turn right.",
    projectName: "March kit",
    part: "plate",
    mcu: "teensy40",
    sketch: "biped",
    legs: 6,
    picked: { pack2s: 1, switch: 1, bec6: 1, sg90: 8, mpu6050: 1 },
  },
];

export function chassisById(id: ChassisId): ChassisPreset {
  return CHASSIS.find((c) => c.id === id) ?? CHASSIS[0]!;
}

export function sketchesFor(id: ChassisId): SketchId[] {
  return ["bringup", chassisById(id).sketch, "rate"];
}

const SERVO_TABLE: Record<ChassisId, string[]> = {
  plane: ["elevon L", "elevon R", "rudder", "flap"],
  drone: ["gimbal pan", "gimbal tilt", "payload", "aux"],
  heli: ["swash roll", "swash pitch", "collective", "tail"],
  spider: Array.from({ length: 12 }, (_, i) => `leg ${i + 1}`),
  humanoid: [
    "hip L",
    "hip R",
    "knee L",
    "knee R",
    "ankle L",
    "ankle R",
    "shoulder L",
    "shoulder R",
    "elbow L",
    "elbow R",
    "head pan",
    "head tilt",
  ],
};

export function servoLabel(chassis: ChassisId, index: number): string {
  return SERVO_TABLE[chassis][index] ?? `servo ${index + 1}`;
}

const DRONE_ESC = ["FL", "FR", "RR", "RL"];

export function escLabel(chassis: ChassisId, index: number): string {
  if (chassis === "drone") return DRONE_ESC[index] ?? `motor ${index + 1}`;
  if (chassis === "heli") return index === 0 ? "main" : `tail ${index}`;
  if (chassis === "plane") return index === 0 ? "motor" : `motor ${index + 1}`;
  return `motor ${index + 1}`;
}
