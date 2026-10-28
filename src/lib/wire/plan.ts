import { escLabel, servoLabel, type ChassisId } from "../robots/chassis";
import { type DeviceId, type McuId, mcuName } from "./catalog";

export type WireKind = "power" | "ground" | "signal" | "i2c" | "uart";

export type Issue = { level: "fault" | "caution"; title: string; detail: string };

export type Wire = { id: string; from: string; to: string; kind: WireKind };

export type PinUse = { pin: string; goesTo: string; kind: WireKind };

export type Counts = Partial<Record<DeviceId, number>>;

export type Plan = {
  issues: Issue[];
  wires: Wire[];
  pins: PinUse[];
  rails: { name: string; continuousMa: number; peakMa: number; budgetMa: number }[];
  mcu: McuId;
  logic: "5" | "3.3";
  servos: { name: string; pin: string }[];
  escs: { name: string; pin: string }[];
  drv: { in1: string; in2: string; in3: string; in4: string } | null;
  i2c: { sda: string; scl: string; devices: { name: string; addr: string }[] } | null;
  gps: { rx: string; tx: string; note: string } | null;
  sonar: { trig: string; echo: string } | null;
  receiver: { ail: string; ele: string; thr: string; rud: string } | null;
  led: string;
};

export function countOf(counts: Counts, id: DeviceId): number {
  return Math.max(0, counts[id] ?? 0);
}

export type PartNames = { servos?: string[]; motors?: string[] };

export function buildPlan(mcu: McuId, raw: Counts, chassis: ChassisId = "plane", names?: PartNames): Plan {
  const n = (id: DeviceId) => countOf(raw, id);
  const issues: Issue[] = [];
  const wires: Wire[] = [];
  const pins: PinUse[] = [];
  let wireN = 0;
  const add = (from: string, to: string, kind: WireKind) => {
    wires.push({ id: `w${wireN++}`, from, to, kind });
  };
  const use = (pin: string, goesTo: string, kind: WireKind) => {
    pins.push({ pin, goesTo, kind });
  };

  const logic: "5" | "3.3" = mcu === "uno" ? "5" : "3.3";
  const led = mcu === "esp32" ? "2" : "13";
  const pool = makePool(mcu);

  if (n("pack2s") + n("pack3s") > 1) {
    issues.push({
      level: "fault",
      title: "Two packs selected",
      detail: "A bench has one battery. Unselect 2S or 3S before trusting the rest of this sheet.",
    });
  }
  if (n("bec5") && n("bec6")) {
    issues.push({
      level: "fault",
      title: "Two BECs selected",
      detail: "Pick the 5 V or the 6 V unit, not both. Their outputs must not be tied.",
    });
  }

  const pack = n("pack3s") ? "3S" : n("pack2s") ? "2S" : null;
  const externalBec = n("bec6") ? "6 V 5 A" : n("bec5") ? "5 V 3 A" : null;
  const escBec = n("esc") > 0;
  if (externalBec && escBec) {
    const many = n("esc") > 1;
    issues.push({
      level: many ? "caution" : "fault",
      title: many ? "Cut every ESC red wire" : "ESC BEC fights the external BEC",
      detail: many
        ? "The external BEC is the only 5 V source. Cut or unplug the red wire on every ESC, then tie the grounds. Leave the signal wire."
        : "Cut or unplug the red wire from the ESC. Leave the black ground and the white signal. Two 5 V sources on one rail is how regulators cook.",
    });
  }
  if (n("esc") > 1 && !externalBec) {
    issues.push({
      level: "fault",
      title: "ESC BECs tied together",
      detail: "More than one red BEC wire on the same rail will fight. Add one external BEC and cut the red wire on every ESC.",
    });
  }

  const railName = externalBec
    ? externalBec
    : escBec
      ? "ESC BEC 5 V / 2 A"
      : mcu === "uno"
        ? "Uno 5 V pin"
        : mcu === "esp32"
          ? "ESP32 5 V (USB)"
          : "Teensy 5 V (USB)";
  const budgetMa = externalBec ? (n("bec6") ? 5000 : 3000) : escBec && n("esc") === 1 ? 2000 : mcu === "uno" ? 400 : mcu === "esp32" ? 500 : 250;

  const sg90 = n("sg90");
  const mg = n("mg996");
  const servoTotal = sg90 + mg;
  const continuous =
    sg90 * 120 + mg * 400 + (n("receiver") ? 40 : 0) + (n("hcsr04") ? 15 : 0) + (n("gps") ? 50 : 0);
  const peak = sg90 * 650 + mg * 2500 + (n("receiver") ? 80 : 0) + (n("hcsr04") ? 50 : 0) + (n("gps") ? 70 : 0);

  if ((sg90 > 0 || mg > 0 || n("receiver")) && !externalBec && !escBec) {
    issues.push({
      level: "fault",
      title: "Servos are on the board regulator",
      detail: `${mcuName(mcu)} cannot feed hobby servos. Add a BEC, or an ESC that still has its red wire, and power the servos from that.`,
    });
  }
  if (continuous > budgetMa) {
    issues.push({
      level: "fault",
      title: "Steady current is over the rail",
      detail: `About ${continuous} mA continuous into a ${budgetMa} mA ${railName}. The board will brown out when the surfaces move.`,
    });
  } else if (peak > budgetMa) {
    issues.push({
      level: "caution",
      title: "Stall current can sag the rail",
      detail: `If every servo stalls together that is about ${peak} mA, above the ${budgetMa} mA planning budget. On the bench, move one surface at a time before a full-throw test.`,
    });
  }
  if (!externalBec && !escBec && (sg90 > 0 || mg > 0) && mcu !== "uno") {
    issues.push({
      level: "fault",
      title: "3.3 V pin is not a servo supply",
      detail: "Signal may be 3.3 V. Servo power still has to come from a BEC.",
    });
  }

  if (pack === "3S" && n("drv8833")) {
    issues.push({
      level: "fault",
      title: "3S is over the DRV8833",
      detail: "That driver is rated to 10.8 V. A full 3S is 12.6 V. Use the 2S pack or a driver meant for 3S.",
    });
  }
  if (pack === "3S" && mg > 0 && !n("bec6") && !externalBec) {
    issues.push({
      level: "caution",
      title: "MG996R and a 3S pack",
      detail: "Do not hang the servo on the pack. A 6 V BEC is the usual fix. A 5 V BEC works, with less torque.",
    });
  }
  if (pack && !n("switch")) {
    issues.push({
      level: "caution",
      title: "No series switch",
      detail: "Put a switch on the pack positive before the BEC and ESC. You want one motion that kills the bench.",
    });
  }
  if (pack) {
    issues.push({
      level: "caution",
      title: "LiPo is not a classroom PSU",
      detail: "Charge it in a bag, off the airframe. This sheet does not size C-rating or a fuse — add a fuse at the pack anyway.",
    });
  }
  if (!pack && (n("esc") > 0 || n("drv8833") > 0)) {
    issues.push({
      level: "fault",
      title: "Motors have no pack",
      detail: "Select a 2S or 3S. USB cannot spin a brushed gearmotor or a prop, and it should not be asked to.",
    });
  }

  if (n("bmp280") && logic === "5") {
    issues.push({
      level: "caution",
      title: "BMP280 is a 3.3 V part",
      detail: "Power it from the Uno 3.3 V pin, not 5 V. Many bare modules have no regulator and die at 5 V.",
    });
  }
  if (n("hcsr04") && logic === "3.3") {
    issues.push({
      level: "fault",
      title: "HC-SR04 echo is 5 V",
      detail: "Do not land Echo on an ESP32 or Teensy pin. A divider (1 kΩ to the pin, 2 kΩ to ground) or a 5 V-tolerant buffer first.",
    });
  }
  if (n("gps") && logic === "5") {
    issues.push({
      level: "fault",
      title: "GPS RX is not 5 V tolerant",
      detail: "Uno TX into a NEO-6M RX can damage the module. Series 1 kΩ, or a divider, on the wire that enters the GPS.",
    });
  }
  if (n("mpu6050") && logic === "5") {
    issues.push({
      level: "caution",
      title: "MPU highs are 3.3 V",
      detail: "A GY-521 on an Uno usually answers at 0x68 because 3.3 V is just enough to count as high. If the scan misses it, the pull-ups or the level are the first place to look.",
    });
  }
  if (n("mpu6050") && n("bmp280")) {
    issues.push({
      level: "caution",
      title: "Shared I2C",
      detail: "MPU 0x68 and BMP280 0x76 can share SDA and SCL. One pair of wires, both grounds, do not invent a second bus yet.",
    });
  }

  const gps = n("gps") ? reserveUart(pool, mcu) : null;
  const i2cDevices: { name: string; addr: string }[] = [];
  if (n("mpu6050")) i2cDevices.push({ name: "MPU6050", addr: "0x68" });
  if (n("bmp280")) i2cDevices.push({ name: "BMP280", addr: "0x76" });
  const i2c = i2cDevices.length && pool.i2c ? pool.i2c : null;
  if (i2cDevices.length && !pool.i2c) {
    issues.push({
      level: "fault",
      title: "No I2C pins left",
      detail: "The gyro or barometer needs SDA and SCL. Those pins are already reserved.",
    });
  }

  const escs: { name: string; pin: string }[] = [];
  for (let i = 0; i < n("esc"); i++) {
    const pin = take(pool, true);
    if (!pin) {
      issues.push({
        level: "fault",
        title: "Out of PWM pins",
        detail: "Not enough PWM pins for every ESC. Drop a servo or move to the Teensy.",
      });
      break;
    }
    escs.push({ name: names?.motors?.[i] ?? escLabel(chassis, i), pin });
  }

  const servos: { name: string; pin: string }[] = [];
  for (let i = 0; i < servoTotal; i++) {
    const pin = take(pool, true);
    if (!pin) {
      issues.push({
        level: "fault",
        title: "Out of PWM pins",
        detail: `${mcuName(mcu)} ran out of PWM pins at servo ${i + 1}. Fewer surfaces, or a Teensy.`,
      });
      break;
    }
    servos.push({ name: names?.servos?.[i] ?? servoLabel(chassis, i), pin });
  }

  let drv: Plan["drv"] = null;
  if (n("drv8833")) {
    const in1 = take(pool, true);
    const in2 = take(pool, true);
    const in3 = take(pool, true);
    const in4 = take(pool, true);
    if (!in1 || !in2 || !in3 || !in4) {
      issues.push({
        level: "fault",
        title: "Not enough PWM pins for the DRV8833",
        detail: "Each motor channel needs two PWM pins so it can reverse. Free a servo or move to the Teensy.",
      });
    } else {
      drv = { in1, in2, in3, in4 };
    }
  }

  let sonar: Plan["sonar"] = null;
  if (n("hcsr04")) {
    const trig = take(pool, false);
    const echo = take(pool, false);
    if (!trig || !echo) {
      issues.push({
        level: "fault",
        title: "Not enough pins for the sonar",
        detail: "HC-SR04 needs a trigger and an echo pin.",
      });
    } else sonar = { trig, echo };
  }

  let receiver: Plan["receiver"] = null;
  if (n("receiver")) {
    const ail = take(pool, false);
    const ele = take(pool, false);
    const thr = take(pool, false);
    const rud = take(pool, false);
    if (!ail || !ele || !thr || !rud) {
      issues.push({
        level: "fault",
        title: "Not enough pins for the receiver",
        detail: "Four PWM channels need four free digital inputs. SBUS is the way out, and it is a later lab.",
      });
    } else receiver = { ail, ele, thr, rud };
  }

  const board = mcuName(mcu);
  if (pack && n("pack2s") + n("pack3s") === 1) {
    if (n("switch")) {
      add(`${pack} pack +`, "Switch in", "power");
      add("Switch out", externalBec ? "BEC in +" : escBec ? "ESC VBAT +" : "nowhere yet — add a BEC", "power");
    } else {
      add(`${pack} pack +`, externalBec ? "BEC in +" : escBec ? "ESC VBAT +" : "no 5 V rail yet", "power");
    }
    add(`${pack} pack −`, "Common ground", "ground");
    if (n("esc")) add(`${pack} pack + (after switch)`, n("esc") > 1 ? "Both ESC VBAT +" : "ESC VBAT +", "power");
    if (n("drv8833")) add(`${pack} pack (after switch)`, "DRV8833 VM and GND", "power");
  }
  if (externalBec) {
    add("BEC out +", `${board} 5 V / VIN as labeled on the board`, "power");
    add("BEC out −", `${board} GND`, "ground");
    if (servoTotal) add("BEC out +", "Servo + (red)", "power");
    if (n("receiver")) add("BEC out +", "Receiver +", "power");
    if (n("hcsr04")) add("BEC out +", "HC-SR04 VCC", "power");
    if (n("gps")) add("BEC or USB 5 V", "NEO-6M VCC", "power");
  } else if (escBec) {
    add("ESC BEC red (one ESC only)", `${board} 5 V`, "power");
    add("ESC ground", `${board} GND`, "ground");
    if (servoTotal) add("ESC BEC red", "Servo + (red)", "power");
    if (n("receiver")) add("ESC BEC red", "Receiver +", "power");
  }
  add("Every module GND", `${board} GND`, "ground");

  for (const s of servos) {
    use(s.pin, s.name, "signal");
    add(`${board} D${s.pin}`, `${s.name} signal (yellow / white)`, "signal");
    add("Common ground", `${s.name} −`, "ground");
  }
  for (const e of escs) {
    use(e.pin, e.name, "signal");
    add(`${board} D${e.pin}`, e.name, "signal");
  }
  if (drv) {
    use(drv.in1, "DRV IN1 left PWM", "signal");
    use(drv.in2, "DRV IN2 left dir", "signal");
    use(drv.in3, "DRV IN3 right PWM", "signal");
    use(drv.in4, "DRV IN4 right dir", "signal");
    add(`${board} D${drv.in1}`, "DRV8833 IN1", "signal");
    add(`${board} D${drv.in2}`, "DRV8833 IN2", "signal");
    add(`${board} D${drv.in3}`, "DRV8833 IN3", "signal");
    add(`${board} D${drv.in4}`, "DRV8833 IN4", "signal");
    add(`${board} GND`, "DRV8833 logic GND", "ground");
  }
  if (i2c) {
    use(i2c.sda, "SDA", "i2c");
    use(i2c.scl, "SCL", "i2c");
    for (const d of i2cDevices) {
      add(`${board} SDA ${i2c.sda}`, `${d.name} SDA`, "i2c");
      add(`${board} SCL ${i2c.scl}`, `${d.name} SCL`, "i2c");
    }
    if (n("mpu6050")) {
      add(logic === "5" ? `${board} 5 V` : `${board} 3.3 V`, "MPU6050 VCC", "power");
    }
    if (n("bmp280")) add(`${board} 3.3 V`, "BMP280 VCC", "power");
  }
  if (gps) {
    use(gps.rx, "GPS TX → MCU RX", "uart");
    use(gps.tx, "MCU TX → GPS RX", "uart");
    add(`GPS TX`, `${board} RX ${gps.rx}`, "uart");
    add(`${board} TX ${gps.tx}`, "GPS RX", "uart");
    add(`${board} GND`, "GPS GND", "ground");
  }
  if (sonar) {
    use(sonar.trig, "Sonar trig", "signal");
    use(sonar.echo, "Sonar echo", "signal");
    add(`${board} D${sonar.trig}`, "HC-SR04 Trig", "signal");
    add("HC-SR04 Echo", `${board} D${sonar.echo}`, "signal");
  }
  if (receiver) {
    use(receiver.ail, "Rx ail", "signal");
    use(receiver.ele, "Rx ele", "signal");
    use(receiver.thr, "Rx thr", "signal");
    use(receiver.rud, "Rx rud", "signal");
    add("Receiver ch1 ail", `${board} D${receiver.ail}`, "signal");
    add("Receiver ch2 ele", `${board} D${receiver.ele}`, "signal");
    add("Receiver ch3 thr", `${board} D${receiver.thr}`, "signal");
    add("Receiver ch4 rud", `${board} D${receiver.rud}`, "signal");
  }

  return {
    issues,
    wires,
    pins,
    rails: pack || servoTotal || n("receiver") ? [{ name: railName, continuousMa: continuous, peakMa: peak, budgetMa }] : [],
    mcu,
    logic,
    servos,
    escs,
    drv,
    i2c: i2c ? { sda: i2c.sda, scl: i2c.scl, devices: i2cDevices } : null,
    gps,
    sonar,
    receiver,
    led,
  };
}

type Pool = {
  pwm: string[];
  digital: string[];
  i2c: { sda: string; scl: string } | null;
  uart: { rx: string; tx: string; note: string } | null;
};

function makePool(mcu: McuId): Pool {
  if (mcu === "uno") {
    return {
      pwm: ["9", "10", "5", "6", "3", "11"],
      digital: ["2", "4", "7", "8", "12", "13", "A0", "A1", "A2", "A3"],
      i2c: { sda: "A4", scl: "A5" },
      uart: { rx: "2", tx: "3", note: "SoftwareSerial. Leave D0/D1 for USB." },
    };
  }
  if (mcu === "esp32") {
    return {
      pwm: ["25", "26", "27", "32", "33", "13", "14", "18", "19", "23"],
      digital: ["4", "5", "16", "17"],
      i2c: { sda: "21", scl: "22" },
      uart: { rx: "16", tx: "17", note: "UART2." },
    };
  }
  return {
    pwm: ["2", "3", "4", "5", "6", "9", "10", "11", "12", "14", "15"],
    digital: ["7", "8", "20", "21", "22", "23"],
    i2c: { sda: "18", scl: "19" },
    uart: { rx: "0", tx: "1", note: "Serial1." },
  };
}

function reserveUart(pool: Pool, mcu: McuId): { rx: string; tx: string; note: string } | null {
  if (!pool.uart) return null;
  const { rx, tx, note } = pool.uart;
  pool.pwm = pool.pwm.filter((p) => p !== rx && p !== tx);
  pool.digital = pool.digital.filter((p) => p !== rx && p !== tx);
  if (mcu === "esp32") {
    pool.digital = pool.digital.filter((p) => p !== "16" && p !== "17");
  }
  return { rx, tx, note };
}

function take(pool: Pool, pwm: boolean): string | null {
  if (pwm) {
    if (pool.pwm.length) return pool.pwm.shift() ?? null;
    return null;
  }
  if (pool.digital.length) return pool.digital.shift() ?? null;
  if (pool.pwm.length) return pool.pwm.shift() ?? null;
  return null;
}
