import type { FlightConfig } from "./types";

export const STANDARD_GRAVITY = 9.80665;
const finite = (n: number) => Number.isFinite(n);

/** Planning calculations only; thrust and current must describe the same hardware/test conditions. */
export function analyzeFlight(config: FlightConfig) {
  const notices: string[] = [];
  const validItems = config.massItems.filter(
    (item) =>
      [item.massG, item.costUsd, item.xMm, item.yMm, item.zMm].every(finite) &&
      item.massG >= 0 &&
      item.costUsd >= 0,
  );
  if (validItems.length !== config.massItems.length)
    notices.push(
      "Invalid mass rows were excluded. Enter finite, nonnegative mass and cost values.",
    );
  const totalMassG = validItems.reduce((sum, item) => sum + item.massG, 0);
  const totalCostUsd = validItems.reduce((sum, item) => sum + item.costUsd, 0);
  const cg =
    totalMassG > 0
      ? {
          xMm: validItems.reduce((sum, item) => sum + item.massG * item.xMm, 0) / totalMassG,
          yMm: validItems.reduce((sum, item) => sum + item.massG * item.yMm, 0) / totalMassG,
          zMm: validItems.reduce((sum, item) => sum + item.massG * item.zMm, 0) / totalMassG,
        }
      : null;
  const propulsionValid =
    Number.isInteger(config.rotorCount) &&
    config.rotorCount > 0 &&
    finite(config.thrustPerMotorG) &&
    config.thrustPerMotorG >= 0;
  const totalThrustG = propulsionValid ? config.rotorCount * config.thrustPerMotorG : 0;
  const thrustToWeight = propulsionValid && totalMassG > 0 ? totalThrustG / totalMassG : null;
  const payloadMarginG = propulsionValid && totalMassG > 0 ? totalThrustG - totalMassG : null;
  const hoverCurrentA =
    config.rotorCount * config.hoverCurrentPerMotorA + config.electronicsCurrentA;
  const usableAh = (config.batteryMah / 1000) * config.usableFraction;
  const capacityValid =
    finite(usableAh) &&
    config.batteryMah > 0 &&
    config.usableFraction > 0 &&
    config.usableFraction <= 1;
  const hoverRuntimeMin =
    capacityValid &&
    Number.isInteger(config.rotorCount) &&
    config.rotorCount > 0 &&
    config.hoverCurrentPerMotorA >= 0 &&
    config.electronicsCurrentA >= 0 &&
    finite(hoverCurrentA) &&
    hoverCurrentA > 0
      ? (usableAh / hoverCurrentA) * 60
      : null;
  const cruiseCurrentA = config.cruiseCurrentA + config.electronicsCurrentA;
  const cruiseRuntimeMin =
    capacityValid &&
    finite(cruiseCurrentA) &&
    config.cruiseCurrentA > 0 &&
    config.electronicsCurrentA >= 0
      ? (usableAh / cruiseCurrentA) * 60
      : null;
  const wingLoadingGdm2 =
    finite(config.wingAreaDm2) && config.wingAreaDm2 > 0 && totalMassG > 0
      ? totalMassG / config.wingAreaDm2
      : null;
  const stallSpeedMs =
    wingLoadingGdm2 !== null &&
    finite(config.airDensity) &&
    config.airDensity > 0 &&
    finite(config.clMax) &&
    config.clMax > 0
      ? Math.sqrt(
          (2 * (totalMassG / 1000) * STANDARD_GRAVITY) /
            (((config.airDensity * config.wingAreaDm2) / 100) * config.clMax),
        )
      : null;
  if (!config.thrustSource.trim())
    notices.push(
      "Propulsion inputs are unsourced planning assumptions. Add the motor, propeller, voltage, and test/datasheet reference.",
    );
  if (
    config.massItems.some((item) => !item.source.trim() || /planning estimate/i.test(item.source))
  )
    notices.push(
      "Some mass/cost rows are estimates. Replace them with measurements or supplier references before making decisions.",
    );
  if (thrustToWeight !== null && thrustToWeight <= 1)
    notices.push(
      "Entered total maximum thrust does not exceed vehicle weight. These inputs do not support hover.",
    );
  if (config.testVoltageV <= 0 || !finite(config.testVoltageV))
    notices.push("A valid propulsion test voltage is required to interpret the thrust input.");
  if (
    config.cellCount > 0 &&
    Math.abs(config.testVoltageV - config.cellCount * 3.7) > config.cellCount * 0.5
  )
    notices.push(
      "Test voltage differs substantially from nominal pack voltage. Do not transfer a thrust result between unmatched battery conditions.",
    );
  if (!capacityValid)
    notices.push(
      "Enter positive battery capacity and a usable fraction greater than zero and no more than one.",
    );
  return {
    totalMassG,
    totalCostUsd,
    cg,
    totalThrustG,
    thrustToWeight,
    hoverCurrentA,
    hoverRuntimeMin,
    cruiseRuntimeMin,
    wingLoadingGdm2,
    stallSpeedMs,
    payloadMarginG,
    notices,
  };
}
