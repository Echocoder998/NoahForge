import { mcuName, type McuId } from "../wire/catalog";
import type { Plan } from "../wire/plan";

export type SketchId = "bringup" | "mixer" | "quad" | "swash" | "gait" | "biped" | "rate";

export const SKETCHES: { id: SketchId; name: string; blurb: string }[] = [
  {
    id: "bringup",
    name: "Bring-up",
    blurb: "Pins, I2C scan, and a slow surface sweep. Nothing is armed.",
  },
  {
    id: "mixer",
    name: "Elevon mixer",
    blurb: "Pitch plus roll, pitch minus roll. The flying-wing sum, with the ESC held off.",
  },
  {
    id: "quad",
    name: "Quad mix",
    blurb: "X layout. Front-left, front-right, rear-right, rear-left. ESCs stay disarmed.",
  },
  {
    id: "swash",
    name: "Swash",
    blurb: "Roll, pitch, collective, and tail as four horns. The 120° mix is the next page.",
  },
  {
    id: "gait",
    name: "Tripod gait",
    blurb: "Odd legs swing while even legs hold, then they trade. One servo per leg.",
  },
  {
    id: "biped",
    name: "March",
    blurb: "Hips oppose. Knees bend on the swing half. Shoulders follow the opposite hip.",
  },
  {
    id: "rate",
    name: "Rate loop",
    blurb: "One-axis gyro feedback on the first surface. Tip the board and watch it fight you.",
  },
];

export function makeSketch(
  kind: SketchId,
  project: string,
  plan: Plan,
  chassis: string = "plane",
): { filename: string; code: string } {
  const slug = project
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "airframe";
  const title = SKETCHES.find((s) => s.id === kind)?.name ?? kind;
  const lines: string[] = [
    `// Noah Forge — ${title}`,
    `// Project: ${project}`,
    `// Airframe: ${chassis}`,
    `// Board: ${mcuName(plan.mcu)}`,
    "// Props OFF. Link the horns, or nothing, until you trust the signs.",
    "// Generated as a starting sketch. Read it before you flash it.",
    "",
  ];
  for (const issue of plan.issues.filter((i) => i.level === "fault")) {
    lines.push(`// FAULT still open: ${issue.title}. ${issue.detail}`);
  }
  if (plan.issues.some((i) => i.level === "fault")) lines.push("");

  const usesServo = plan.servos.length > 0 || plan.escs.length > 0;
  if (usesServo) {
    lines.push(plan.mcu === "esp32" ? "#include <ESP32Servo.h>" : "#include <Servo.h>");
  }
  if (plan.i2c) lines.push("#include <Wire.h>");
  if (plan.gps && plan.mcu === "uno") lines.push("#include <SoftwareSerial.h>");
  lines.push("");

  lines.push(`const int LED = ${plan.led};`);
  lines.push("const bool ARM_ESC = false; // leave false until props are off AND you mean it");
  for (const s of plan.servos) lines.push(`const int PIN_${id(s.name)} = ${pinExpr(s.pin)};`);
  for (const e of plan.escs) lines.push(`const int PIN_${id(e.name)} = ${pinExpr(e.pin)};`);
  if (plan.drv) {
    lines.push(`const int PIN_IN1 = ${pinExpr(plan.drv.in1)};`);
    lines.push(`const int PIN_IN2 = ${pinExpr(plan.drv.in2)};`);
    lines.push(`const int PIN_IN3 = ${pinExpr(plan.drv.in3)};`);
    lines.push(`const int PIN_IN4 = ${pinExpr(plan.drv.in4)};`);
  }
  if (plan.sonar) {
    lines.push(`const int PIN_TRIG = ${pinExpr(plan.sonar.trig)};`);
    lines.push(`const int PIN_ECHO = ${pinExpr(plan.sonar.echo)};`);
  }
  if (plan.receiver) {
    lines.push(`const int PIN_AIL = ${pinExpr(plan.receiver.ail)};`);
    lines.push(`const int PIN_ELE = ${pinExpr(plan.receiver.ele)};`);
    lines.push(`const int PIN_THR = ${pinExpr(plan.receiver.thr)};`);
    lines.push(`const int PIN_RUD = ${pinExpr(plan.receiver.rud)};`);
  }
  if (plan.gps) {
    lines.push(`const int PIN_GPS_RX = ${pinExpr(plan.gps.rx)}; // board RX, wire to GPS TX`);
    lines.push(`const int PIN_GPS_TX = ${pinExpr(plan.gps.tx)}; // board TX, wire to GPS RX`);
  }
  lines.push("");

  if (usesServo) {
    for (const s of plan.servos) lines.push(`Servo ${id(s.name).toLowerCase()};`);
    for (const e of plan.escs) lines.push(`Servo ${id(e.name).toLowerCase()};`);
    lines.push("");
  }
  if (plan.gps && plan.mcu === "uno") {
    lines.push("SoftwareSerial gpsPort(PIN_GPS_RX, PIN_GPS_TX);");
    lines.push("");
  }

  lines.push("void setup() {");
  lines.push("  pinMode(LED, OUTPUT);");
  lines.push("  Serial.begin(115200);");
  lines.push(`  Serial.println(F("Noah Forge — ${title}"));`);
  if (plan.i2c) {
    if (plan.mcu === "esp32") lines.push(`  Wire.begin(${plan.i2c.sda}, ${plan.i2c.scl});`);
    else lines.push("  Wire.begin();");
    if (plan.i2c.devices.some((d) => d.addr === "0x68")) {
      lines.push("  Wire.beginTransmission(0x68);");
      lines.push("  Wire.write(0x6B); // PWR_MGMT_1");
      lines.push("  Wire.write(0x00); // wake");
      lines.push("  Wire.endTransmission();");
    }
    lines.push("  scanI2c();");
  }
  if (plan.gps) lines.push(...gpsBegin(plan.mcu));
  if (plan.sonar) {
    lines.push("  pinMode(PIN_TRIG, OUTPUT);");
    lines.push("  pinMode(PIN_ECHO, INPUT);");
  }
  if (plan.drv) {
    lines.push("  pinMode(PIN_IN1, OUTPUT);");
    lines.push("  pinMode(PIN_IN2, OUTPUT);");
    lines.push("  pinMode(PIN_IN3, OUTPUT);");
    lines.push("  pinMode(PIN_IN4, OUTPUT);");
    lines.push("  digitalWrite(PIN_IN1, LOW);");
    lines.push("  digitalWrite(PIN_IN2, LOW);");
    lines.push("  digitalWrite(PIN_IN3, LOW);");
    lines.push("  digitalWrite(PIN_IN4, LOW);");
  }
  for (const s of plan.servos) {
    const v = id(s.name).toLowerCase();
    lines.push(`  ${v}.attach(PIN_${id(s.name)});`);
    lines.push(`  ${v}.writeMicroseconds(1500);`);
  }
  for (const e of plan.escs) {
    const v = id(e.name).toLowerCase();
    lines.push(`  ${v}.attach(PIN_${id(e.name)});`);
    lines.push(`  ${v}.writeMicroseconds(1000); // idle throttle, disarmed`);
  }
  lines.push("}");
  lines.push("");

  if (kind === "bringup") lines.push(...bringupLoop(plan));
  else if (kind === "mixer") lines.push(...mixerLoop(plan));
  else if (kind === "quad") lines.push(...quadLoop(plan));
  else if (kind === "swash") lines.push(...swashLoop(plan));
  else if (kind === "gait") lines.push(...gaitLoop(plan));
  else if (kind === "biped") lines.push(...bipedLoop(plan));
  else lines.push(...rateLoop(plan));

  if (plan.i2c) lines.push(...i2cHelpers());
  if (plan.sonar) lines.push(...sonarHelper());
  const mixes = kind === "mixer" || kind === "quad" || kind === "swash" || kind === "gait" || kind === "biped";
  if (plan.receiver && mixes) lines.push(...radioHelpers());

  return { filename: `${slug}-${kind}.ino`, code: lines.join("\n") };
}

function bringupLoop(plan: Plan): string[] {
  const lines = [
    "unsigned long lastPrint = 0;",
    "",
    "void loop() {",
    "  digitalWrite(LED, (millis() / 400) % 2);",
    "  // Slow motion so you can watch the hardware. Props stay off.",
    "  float t = millis() / 1000.0f;",
  ];
  plan.servos.forEach((s, i) => {
    const v = id(s.name).toLowerCase();
    lines.push(
      `  ${v}.writeMicroseconds(1500 + (int)(280.0f * sin(t * ${i % 2 === 0 ? "1.1f" : "0.7f"})));`,
    );
  });
  for (const e of plan.escs) {
    lines.push(`  ${id(e.name).toLowerCase()}.writeMicroseconds(1000); // stays disarmed`);
  }
  if (plan.drv) {
    lines.push("  // Gentle forward pulse on channel A, then coast. Wheels off the desk.");
    lines.push("  int spd = (sin(t) > 0.6f) ? 80 : 0;");
    lines.push("  analogWrite(PIN_IN1, spd);");
    lines.push("  digitalWrite(PIN_IN2, LOW);");
  }
  lines.push("  if (millis() - lastPrint > 300) {");
  lines.push("    lastPrint = millis();");
  if (plan.i2c?.devices.some((d) => d.addr === "0x68")) {
    lines.push("    float gx, gy, gz;");
    lines.push("    if (readGyro(gx, gy, gz)) {");
    lines.push('      Serial.print(F("gyro deg/s  x=")); Serial.print(gx, 1);');
    lines.push('      Serial.print(F("  y=")); Serial.print(gy, 1);');
    lines.push('      Serial.print(F("  z=")); Serial.println(gz, 1);');
    lines.push("    }");
  }
  if (plan.sonar) lines.push('    Serial.print(F("sonar cm ")); Serial.println(readCm());');
  if (plan.gps) lines.push("    dumpGps();");
  if (!plan.i2c && !plan.sonar && !plan.gps) {
    lines.push('    Serial.println(F("alive — props off, servos sweeping"));');
  }
  lines.push("  }");
  lines.push("}");
  lines.push("");
  if (plan.gps) lines.push(...gpsDump(plan.mcu));
  return lines;
}

function mixerLoop(plan: Plan): string[] {
  const lines = [
    "// Elevon law, the one you will re-derive in aircraft dynamics:",
    "//   left  = pitch + roll",
    "//   right = pitch - roll",
    "// Pitch positive is nose up ONLY if the horns are linked that way.",
    "// If the wing pitches the wrong way, swap the sign on pitch — not both servos.",
    "",
    "void loop() {",
    "  float pitch = 0;",
    "  float roll = 0;",
    "  float yaw = 0;",
    "  int thrUs = 1000;",
  ];
  if (plan.receiver) {
    lines.push("  pitch = normStick(readChannel(PIN_ELE));");
    lines.push("  roll = normStick(readChannel(PIN_AIL));");
    lines.push("  yaw = normStick(readChannel(PIN_RUD));");
    lines.push("  thrUs = readChannel(PIN_THR);");
    lines.push("  if (!ARM_ESC) thrUs = 1000;");
  } else {
    lines.push("  // No receiver on the sheet — a slow stick so the mixer is visible.");
    lines.push("  float t = millis() / 1000.0f;");
    lines.push("  pitch = 0.45f * sin(t * 0.8f);");
    lines.push("  roll = 0.35f * sin(t * 0.5f);");
    lines.push("  yaw = 0.2f * sin(t * 0.3f);");
  }
  lines.push("  // Expo pulls the middle down so a small stick is not a full surface.");
  lines.push("  const float EXPO = 0.30f;");
  lines.push("  pitch = applyExpo(pitch, EXPO);");
  lines.push("  roll = applyExpo(roll, EXPO);");
  lines.push("  float left = constrain(pitch + roll, -1.0f, 1.0f);");
  lines.push("  float right = constrain(pitch - roll, -1.0f, 1.0f);");

  if (plan.servos.length === 0) {
    lines.push("  // No servos on the wiring sheet. Add two SG90s for elevons.");
    lines.push("  (void)left; (void)right; (void)yaw; (void)thrUs;");
  } else if (plan.servos.length === 1) {
    const v = id(plan.servos[0]!.name).toLowerCase();
    lines.push(`  ${v}.writeMicroseconds(usFrom(pitch)); // single surface follows pitch`);
  } else {
    const a = id(plan.servos[0]!.name).toLowerCase();
    const b = id(plan.servos[1]!.name).toLowerCase();
    lines.push(`  ${a}.writeMicroseconds(usFrom(left));`);
    lines.push(`  ${b}.writeMicroseconds(usFrom(right));`);
    if (plan.servos[2]) {
      const c = id(plan.servos[2].name).toLowerCase();
      lines.push(`  ${c}.writeMicroseconds(usFrom(yaw));`);
    }
  }
  for (const e of plan.escs) {
    lines.push(`  ${id(e.name).toLowerCase()}.writeMicroseconds(thrUs);`);
  }
  if (plan.drv) {
    lines.push("  // Differential drive from roll, so the same stick language still means something on the ground.");
    lines.push("  drive(constrain(pitch + roll, -1.0f, 1.0f), constrain(pitch - roll, -1.0f, 1.0f));");
  }
  if (plan.servos.length === 1) lines.push("  (void)left; (void)right; (void)yaw;");
  if (plan.servos.length === 2) lines.push("  (void)yaw;");
  if (plan.escs.length === 0 && plan.servos.length !== 0) lines.push("  (void)thrUs;");
  lines.push("  delay(15); // ~66 Hz is enough to watch a servo. A rate loop cannot live here.");
  lines.push("}");
  lines.push("");
  lines.push("int usFrom(float x) { return (int)(1500 + constrain(x, -1.0f, 1.0f) * 400.0f); }");
  lines.push("float applyExpo(float x, float e) { return (1.0f - e) * x + e * x * x * x; }");
  if (plan.drv) {
    lines.push("void drive(float left, float right) {");
    lines.push("  writeChan(PIN_IN1, PIN_IN2, left);");
    lines.push("  writeChan(PIN_IN3, PIN_IN4, right);");
    lines.push("}");
    lines.push("void writeChan(int pwm, int dir, float x) {");
    lines.push("  int mag = (int)(fabs(x) * 180);");
    lines.push("  if (x >= 0) { analogWrite(pwm, mag); digitalWrite(dir, LOW); }");
    lines.push("  else { analogWrite(pwm, 0); analogWrite(dir, mag); }");
    lines.push("}");
  }
  lines.push("");
  return lines;
}

function rateLoop(plan: Plan): string[] {
  const hasGyro = plan.i2c?.devices.some((d) => d.addr === "0x68") ?? false;
  const surface = plan.servos[0] ? id(plan.servos[0].name).toLowerCase() : null;
  const lines = [
    "// Single-axis rate loop. You will meet the same three terms in feedback controls.",
    "// Start with Ki = 0 and Kd = 0. Raise Kp until the surface chatters, then back off.",
    "// Kd here is on the measurement, not the error, so a stick step does not kick.",
    "// If the surface runs away when you tip the board, set SIGN to -1.",
    "",
    "const float SIGN = 1.0f;",
    "const float KP = 0.80f;   // microseconds per deg/s",
    "const float KI = 0.00f;",
    "const float KD = 0.02f;",
    "const float I_LIM = 200;  // microseconds of integrator, anti-windup",
    "const float MAX_RATE = 180.0f; // stick full scale, deg/s",
    "",
    "float integ = 0;",
    "float prevMeas = 0;",
    "unsigned long prevUs = 0;",
    "",
    "void loop() {",
    "  unsigned long now = micros();",
    "  float dt = (now - prevUs) * 1.0e-6f;",
    "  if (prevUs == 0 || dt > 0.05f) { prevUs = now; return; } // first pass, or a stall",
    "  if (dt < 0.002f) return; // cap near 500 Hz",
    "  prevUs = now;",
    "",
  ];
  if (!hasGyro) {
    lines.push("  // No MPU6050 on the wiring sheet. The loop below is the shape; the sensor is missing.");
    lines.push("  float meas = 0;");
  } else {
    lines.push("  float gx, gy, gz;");
    lines.push("  if (!readGyro(gx, gy, gz)) { prevUs = 0; return; }");
    lines.push("  // Breakouts differ. Y is pitch if the connector faces aft and the board is flat.");
    lines.push("  // Print gx and gz once if the surface ignores a pure nose-up tip.");
    lines.push("  float meas = gy;");
  }
  if (plan.receiver) {
    lines.push("  float cmd = normStick(readChannel(PIN_ELE)) * MAX_RATE;");
  } else {
    lines.push("  float cmd = 0; // hold zero rate. Tip the board — the surface should oppose you.");
  }
  lines.push("  float err = cmd - meas;");
  lines.push("  integ += err * dt;");
  lines.push("  integ = constrain(integ, -I_LIM / max(KI, 0.001f), I_LIM / max(KI, 0.001f));");
  lines.push("  if (KI == 0) integ = 0;");
  lines.push("  float deriv = -(meas - prevMeas) / dt;");
  lines.push("  prevMeas = meas;");
  lines.push("  float u = SIGN * (KP * err + KI * integ + KD * deriv);");
  lines.push("  u = constrain(u, -400.0f, 400.0f);");
  if (surface) {
    lines.push(`  ${surface}.writeMicroseconds(1500 + (int)u);`);
    for (const extra of plan.servos.slice(1)) {
      lines.push(`  ${id(extra.name).toLowerCase()}.writeMicroseconds(1500); // other surfaces hold center`);
    }
  } else {
    lines.push("  // No surface pinned. Add a servo on the wiring bench.");
    lines.push("  (void)u;");
  }
  for (const e of plan.escs) {
    lines.push(`  ${id(e.name).toLowerCase()}.writeMicroseconds(ARM_ESC ? 1100 : 1000);`);
  }
  lines.push("}");
  lines.push("");
  if (plan.receiver) {
    lines.push(...radioHelpers());
  }
  return lines;
}

function quadLoop(plan: Plan): string[] {
  const lines = [
    "// X quad, motors matching the wire sheet: FL, FR, RR, RL.",
    "//   FL = throttle + pitch + roll - yaw",
    "//   FR = throttle + pitch - roll + yaw",
    "//   RR = throttle - pitch - roll - yaw",
    "//   RL = throttle - pitch + roll + yaw",
    "// Props stay off. ARM_ESC only writes throttle when you have already decided that.",
    "",
    "void loop() {",
    "  float pitch = 0;",
    "  float roll = 0;",
    "  float yaw = 0;",
    "  float thr = 0;",
  ];
  if (plan.receiver) {
    lines.push("  pitch = applyExpo(normStick(readChannel(PIN_ELE)), 0.30f);");
    lines.push("  roll = applyExpo(normStick(readChannel(PIN_AIL)), 0.30f);");
    lines.push("  yaw = applyExpo(normStick(readChannel(PIN_RUD)), 0.30f);");
    lines.push("  thr = constrain((readChannel(PIN_THR) - 1000) / 1000.0f, 0.0f, 1.0f);");
  } else {
    lines.push("  float t = millis() / 1000.0f;");
    lines.push("  pitch = 0.25f * sin(t * 0.7f);");
    lines.push("  roll = 0.25f * sin(t * 0.5f);");
    lines.push("  yaw = 0.15f * sin(t * 0.3f);");
    lines.push("  thr = 0.35f;");
  }
  lines.push("  float mix[4] = {");
  lines.push("    thr + pitch + roll - yaw,");
  lines.push("    thr + pitch - roll + yaw,");
  lines.push("    thr - pitch - roll - yaw,");
  lines.push("    thr - pitch + roll + yaw");
  lines.push("  };");
  if (plan.escs.length === 0) {
    lines.push("  // No ESCs on the sheet. A quad wants four.");
    lines.push("  (void)mix;");
  }
  plan.escs.forEach((e, i) => {
    const v = id(e.name).toLowerCase();
    lines.push(`  ${v}.writeMicroseconds(ARM_ESC ? usThr(mix[${i}]) : 1000);`);
  });
  lines.push("  delay(15);");
  lines.push("}");
  lines.push("");
  lines.push("int usThr(float x) { return (int)(1000 + constrain(x, 0.0f, 1.0f) * 800); }");
  lines.push("float applyExpo(float x, float e) { return (1.0f - e) * x + e * x * x * x; }");
  lines.push("");
  return lines;
}

function swashLoop(plan: Plan): string[] {
  const lines = [
    "// Unmixed swash so each horn shows one command.",
    "// Servo order on the sheet: swash roll, swash pitch, collective, tail.",
    "// A 120 degree swash uses the same three numbers, summed onto three arms.",
    "",
    "void loop() {",
    "  float pitch = 0;",
    "  float roll = 0;",
    "  float yaw = 0;",
    "  float coll = 0;",
    "  int thrUs = 1000;",
  ];
  if (plan.receiver) {
    lines.push("  pitch = normStick(readChannel(PIN_ELE));");
    lines.push("  roll = normStick(readChannel(PIN_AIL));");
    lines.push("  yaw = normStick(readChannel(PIN_RUD));");
    lines.push("  int thr = readChannel(PIN_THR);");
    lines.push("  coll = constrain((thr - 1000) / 1000.0f, 0.0f, 1.0f);");
    lines.push("  thrUs = ARM_ESC ? thr : 1000;");
  } else {
    lines.push("  float t = millis() / 1000.0f;");
    lines.push("  pitch = 0.35f * sin(t * 0.6f);");
    lines.push("  roll = 0.35f * sin(t * 0.4f);");
    lines.push("  yaw = 0.2f * sin(t * 0.3f);");
    lines.push("  coll = 0.45f + 0.15f * sin(t * 0.2f);");
  }
  const cmd = ["roll", "pitch", "coll * 2.0f - 1.0f", "yaw"];
  if (plan.servos.length === 0) lines.push("  // No servos on the sheet.");
  plan.servos.forEach((s, i) => {
    const v = id(s.name).toLowerCase();
    lines.push(`  ${v}.writeMicroseconds(usFrom(${cmd[i] ?? "0"}));`);
  });
  for (const e of plan.escs) {
    lines.push(`  ${id(e.name).toLowerCase()}.writeMicroseconds(thrUs);`);
  }
  if (plan.servos.length === 0) lines.push("  (void)pitch; (void)roll; (void)yaw; (void)coll; (void)thrUs;");
  lines.push("  delay(15);");
  lines.push("}");
  lines.push("");
  lines.push("int usFrom(float x) { return (int)(1500 + constrain(x, -1.0f, 1.0f) * 400.0f); }");
  lines.push("");
  return lines;
}

function gaitLoop(plan: Plan): string[] {
  const lines = [
    "// Tripod gait, one servo per leg, centered at 1500.",
    "// Odd legs swing while even legs hold, then they trade.",
    "// Aileron stick yaws: left legs and right legs get opposite offsets.",
    "",
    "void loop() {",
    "  float t = millis() / 1000.0f;",
    "  float turn = 0;",
  ];
  if (plan.receiver) {
    lines.push("  turn = normStick(readChannel(PIN_AIL));");
    lines.push("  float stride = constrain((readChannel(PIN_THR) - 1000) / 1000.0f, 0.05f, 1.0f);");
    lines.push("  t *= 0.6f + stride;");
  }
  lines.push("  bool swingOdd = fmod(t, 2.0f) < 1.0f;");
  lines.push("  float swing = sin(fmod(t, 1.0f) * 3.1416f);");
  if (plan.servos.length === 0) lines.push("  // No leg servos on the sheet.");
  plan.servos.forEach((s, i) => {
    const v = id(s.name).toLowerCase();
    const side = i % 2 === 0 ? "1.0f" : "-1.0f";
    lines.push(`  {`);
    lines.push(`    bool moving = ${i % 2 === 0 ? "swingOdd" : "!swingOdd"};`);
    lines.push(`    float u = (moving ? swing : 0.15f) * ${side} + turn * ${side};`);
    lines.push(`    ${v}.writeMicroseconds(usFrom(constrain(u, -1.0f, 1.0f)));`);
    lines.push(`  }`);
  });
  lines.push("  delay(20);");
  lines.push("}");
  lines.push("");
  lines.push("int usFrom(float x) { return (int)(1500 + constrain(x, -1.0f, 1.0f) * 280.0f); }");
  lines.push("");
  return lines;
}

function bipedLoop(plan: Plan): string[] {
  const lines = [
    "// Servo order: hip L, hip R, knee L, knee R, ankle L, ankle R, then shoulders.",
    "// Hips are opposite. A knee bends only while that leg is swinging forward.",
    "",
    "void loop() {",
    "  float phase = millis() / 1000.0f * 1.6f;",
    "  float turn = 0;",
  ];
  if (plan.receiver) {
    lines.push("  turn = normStick(readChannel(PIN_RUD));");
    lines.push("  float stride = constrain((readChannel(PIN_THR) - 1100) / 800.0f, 0.0f, 1.0f);");
    lines.push("  if (stride < 0.08f) phase = 0;");
  }
  lines.push("  float s = sin(phase);");
  lines.push("  float kneeL = s > 0 ? s : 0;");
  lines.push("  float kneeR = s < 0 ? -s : 0;");
  lines.push("  float pose[] = {");
  lines.push("    s + turn, -s + turn,");
  lines.push("    -kneeL, -kneeR,");
  lines.push("    0.4f * s, -0.4f * s,");
  lines.push("    -0.6f * s, 0.6f * s,");
  lines.push("    0, 0, 0, 0");
  lines.push("  };");
  if (plan.servos.length === 0) lines.push("  // No joint servos on the sheet.");
  plan.servos.forEach((s, i) => {
    const v = id(s.name).toLowerCase();
    lines.push(`  ${v}.writeMicroseconds(usFrom(${i < 12 ? `pose[${i}]` : "0"}));`);
  });
  lines.push("  delay(20);");
  lines.push("}");
  lines.push("");
  lines.push("int usFrom(float x) { return (int)(1500 + constrain(x, -1.0f, 1.0f) * 320.0f); }");
  lines.push("");
  return lines;
}

function i2cHelpers(): string[] {
  const lines = [
    "void scanI2c() {",
    '  Serial.println(F("I2C scan"));',
    "  int found = 0;",
    "  for (uint8_t addr = 1; addr < 127; addr++) {",
    "    Wire.beginTransmission(addr);",
    "    if (Wire.endTransmission() == 0) {",
    '      Serial.print(F("  0x")); Serial.println(addr, HEX);',
    "      found++;",
    "    }",
    "  }",
    "  if (!found) Serial.println(F(\"  none — check SDA, SCL, and ground\"));",
    "}",
    "",
  ];
  lines.push("bool readGyro(float &x, float &y, float &z) {");
    lines.push("  Wire.beginTransmission(0x68);");
    lines.push("  Wire.write(0x43); // GYRO_XOUT_H");
    lines.push("  if (Wire.endTransmission(false) != 0) return false;");
    lines.push("  if (Wire.requestFrom(0x68, 6) != 6) return false;");
    lines.push("  int16_t gx = (Wire.read() << 8) | Wire.read();");
    lines.push("  int16_t gy = (Wire.read() << 8) | Wire.read();");
    lines.push("  int16_t gz = (Wire.read() << 8) | Wire.read();");
    lines.push("  const float lsb = 131.0f; // ±250 deg/s default full scale");
    lines.push("  x = gx / lsb; y = gy / lsb; z = gz / lsb;");
  lines.push("  return true;");
  lines.push("}");
  lines.push("");
  return lines;
}

function sonarHelper(): string[] {
  return [
    "float readCm() {",
    "  digitalWrite(PIN_TRIG, LOW);",
    "  delayMicroseconds(2);",
    "  digitalWrite(PIN_TRIG, HIGH);",
    "  delayMicroseconds(10);",
    "  digitalWrite(PIN_TRIG, LOW);",
    "  unsigned long dur = pulseIn(PIN_ECHO, HIGH, 30000UL);",
    "  return dur / 58.0f;",
    "}",
    "",
  ];
}

function radioHelpers(): string[] {
  return [
    "int readChannel(int pin) {",
    "  unsigned long us = pulseIn(pin, HIGH, 25000UL);",
    "  if (us < 800 || us > 2200) return 1500;",
    "  return (int)us;",
    "}",
    "float normStick(int us) {",
    "  return constrain((us - 1500) / 500.0f, -1.0f, 1.0f);",
    "}",
    "",
  ];
}

function gpsBegin(mcu: McuId): string[] {
  if (mcu === "uno") return ["  gpsPort.begin(9600);"];
  if (mcu === "esp32") return ["  Serial2.begin(9600, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);"];
  return ["  Serial1.begin(9600);"];
}

function gpsDump(mcu: McuId): string[] {
  const port = mcu === "uno" ? "gpsPort" : mcu === "esp32" ? "Serial2" : "Serial1";
  return [
    "void dumpGps() {",
    `  while (${port}.available()) {`,
    `    char c = (char)${port}.read();`,
    "    Serial.write(c);",
    "  }",
    "}",
    "",
  ];
}

function id(name: string): string {
  const s = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([0-9])/, "_$1");
  return s || "PIN";
}

function pinExpr(pin: string): string {
  return pin.startsWith("A") ? pin : pin;
}
