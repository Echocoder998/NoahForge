export type McuId = "uno" | "esp32" | "teensy40";

export type DeviceId =
  | "pack2s"
  | "pack3s"
  | "bec5"
  | "bec6"
  | "switch"
  | "sg90"
  | "mg996"
  | "esc"
  | "drv8833"
  | "mpu6050"
  | "bmp280"
  | "gps"
  | "hcsr04"
  | "receiver";

export type DeviceGroup = "Power" | "Motion" | "Sensing" | "Link";

export type DeviceDef = {
  id: DeviceId;
  group: DeviceGroup;
  name: string;
  blurb: string;
  max: number;
};

export const MCUS: { id: McuId; name: string; blurb: string }[] = [
  { id: "uno", name: "Arduino Uno", blurb: "5 V logic. Fine for a first mixer. Weak 5 V pin." },
  { id: "esp32", name: "ESP32 DevKit", blurb: "3.3 V logic. Wi-Fi later. Do not power servos from the board." },
  { id: "teensy40", name: "Teensy 4.0", blurb: "3.3 V, fast. Enough pins for a real rate loop." },
];

export const DEVICES: DeviceDef[] = [
  { id: "pack2s", group: "Power", name: "2S LiPo", blurb: "7.4 V nominal, 8.4 V full. Through a switch, then a BEC.", max: 1 },
  { id: "pack3s", group: "Power", name: "3S LiPo", blurb: "11.1 V nominal. Too high for servos and a DRV8833.", max: 1 },
  { id: "bec5", group: "Power", name: "5 V 3 A BEC", blurb: "Servo and receiver rail. Disconnect any ESC red wire.", max: 1 },
  { id: "bec6", group: "Power", name: "6 V 5 A BEC", blurb: "Better match for standard servos than a 5 V pin.", max: 1 },
  { id: "switch", group: "Power", name: "Series switch", blurb: "On the pack positive, before the BEC or ESC.", max: 1 },
  { id: "sg90", group: "Motion", name: "SG90 micro servo", blurb: "Planning stall 650 mA. Signal is happy at 3.3 or 5 V.", max: 12 },
  { id: "mg996", group: "Motion", name: "MG996R servo", blurb: "Planning stall 2.5 A. Never from a board regulator.", max: 6 },
  { id: "esc", group: "Motion", name: "30 A ESC with BEC", blurb: "Motor power from the pack. Cut the red wire when an external BEC is the rail.", max: 4 },
  { id: "drv8833", group: "Motion", name: "DRV8833 + DC motors", blurb: "Two channels. Logic 3.3 or 5 V. Motor supply max 10.8 V.", max: 1 },
  { id: "mpu6050", group: "Sensing", name: "MPU6050 breakout", blurb: "Gyro and accel, I2C 0x68. The rate-loop sensor.", max: 1 },
  { id: "bmp280", group: "Sensing", name: "BMP280 breakout", blurb: "Pressure, I2C 0x76. Power it at 3.3 V only.", max: 1 },
  { id: "gps", group: "Sensing", name: "NEO-6M GPS", blurb: "9600 baud NMEA. The RX pin on the module is not 5 V tolerant.", max: 1 },
  { id: "hcsr04", group: "Sensing", name: "HC-SR04 sonar", blurb: "5 V supply. Echo is a 5 V pulse.", max: 1 },
  { id: "receiver", group: "Link", name: "4-ch PWM receiver", blurb: "Ail, ele, thr, rud as pulse width. Power from 5–6 V.", max: 1 },
];

export const GROUPS: DeviceGroup[] = ["Power", "Motion", "Sensing", "Link"];

export function mcuName(id: McuId): string {
  return MCUS.find((m) => m.id === id)?.name ?? id;
}
