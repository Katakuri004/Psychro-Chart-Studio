import psychrolib from "psychrolib";

export type UnitSystem = "si" | "ip";

export interface PsychroInputs {
  pressure: number;
  dryBulb: number;
  relativeHumidity: number; // percentage 0-100
}

export interface PsychroState {
  dryBulb: number;
  wetBulb: number;
  dewPoint: number;
  relativeHumidity: number;
  humidityRatio: number;
  enthalpy: number;
  specificVolume: number;
  density: number;
  vaporPressure: number;
  saturationHumidityRatio: number;
}

export interface ChartExtents {
  dryBulb: [number, number];
  humidityRatio: [number, number];
  enthalpy: [number, number];
}

const UNIT_MAP: Record<UnitSystem, number> = {
  si: psychrolib.SI,
  ip: psychrolib.IP,
};

export const DEFAULT_INPUTS: Record<UnitSystem, PsychroInputs> = {
  si: {
    pressure: 101_325,
    dryBulb: 26,
    relativeHumidity: 50,
  },
  ip: {
    pressure: 14.696,
    dryBulb: 78.8,
    relativeHumidity: 50,
  },
};

const DEFAULT_EXTENTS: Record<UnitSystem, ChartExtents> = {
  si: {
    dryBulb: [-20, 60],
    humidityRatio: [0, 0.035],
    enthalpy: [-20, 120],
  },
  ip: {
    dryBulb: [-4, 140],
    humidityRatio: [0, 0.03],
    enthalpy: [-10, 55],
  },
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const withUnitSystem = <T>(system: UnitSystem, callback: () => T) => {
  psychrolib.SetUnitSystem(UNIT_MAP[system]);
  return callback();
};

export function getChartExtents(system: UnitSystem): ChartExtents {
  return DEFAULT_EXTENTS[system];
}

export function computePsychrometrics(
  inputs: PsychroInputs,
  system: UnitSystem
): PsychroState | null {
  const { dryBulb, pressure } = inputs;
  const relativeHumidityFraction = clamp(inputs.relativeHumidity / 100, 0, 1);

  return withUnitSystem(system, () => {
    try {
      const humidityRatio = psychrolib.GetHumRatioFromRelHum(
        dryBulb,
        relativeHumidityFraction,
        pressure
      );

      const wetBulb = psychrolib.GetTWetBulbFromHumRatio(
        dryBulb,
        humidityRatio,
        pressure
      );

      const dewPoint = psychrolib.GetTDewPointFromHumRatio(
        dryBulb,
        humidityRatio,
        pressure
      );

      const enthalpy = psychrolib.GetMoistAirEnthalpy(dryBulb, humidityRatio);
      const specificVolume = psychrolib.GetMoistAirVolume(
        dryBulb,
        humidityRatio,
        pressure
      );
      const density = psychrolib.GetMoistAirDensity(
        dryBulb,
        humidityRatio,
        pressure
      );
      const vaporPressure = psychrolib.GetVapPresFromHumRatio(
        humidityRatio,
        pressure
      );
      const saturationHumidityRatio =
        psychrolib.GetSatHumRatio(dryBulb, pressure);

      return {
        dryBulb,
        wetBulb,
        dewPoint,
        relativeHumidity: relativeHumidityFraction * 100,
        humidityRatio,
        enthalpy,
        specificVolume,
        density,
        vaporPressure,
        saturationHumidityRatio,
      };
    } catch (error) {
      console.error("Psychrometric calculation error", error);
      return null;
    }
  });
}

export interface PsychroHumRatioInputs {
  dryBulb: number;
  humidityRatio: number;
  pressure: number;
}

export function computePsychrometricsFromHumRatio(
  inputs: PsychroHumRatioInputs,
  system: UnitSystem
): PsychroState | null {
  const { dryBulb, humidityRatio, pressure } = inputs;

  return withUnitSystem(system, () => {
    try {
      const relativeHumidity =
        psychrolib.GetRelHumFromHumRatio(dryBulb, humidityRatio, pressure) * 100;
      const wetBulb = psychrolib.GetTWetBulbFromHumRatio(
        dryBulb,
        humidityRatio,
        pressure
      );
      const dewPoint = psychrolib.GetTDewPointFromHumRatio(
        dryBulb,
        humidityRatio,
        pressure
      );
      const enthalpy = psychrolib.GetMoistAirEnthalpy(dryBulb, humidityRatio);
      const specificVolume = psychrolib.GetMoistAirVolume(
        dryBulb,
        humidityRatio,
        pressure
      );
      const density = psychrolib.GetMoistAirDensity(
        dryBulb,
        humidityRatio,
        pressure
      );
      const vaporPressure = psychrolib.GetVapPresFromHumRatio(
        humidityRatio,
        pressure
      );
      const saturationHumidityRatio =
        psychrolib.GetSatHumRatio(dryBulb, pressure);

      return {
        dryBulb,
        wetBulb,
        dewPoint,
        relativeHumidity,
        humidityRatio,
        enthalpy,
        specificVolume,
        density,
        vaporPressure,
        saturationHumidityRatio,
      };
    } catch (error) {
      console.error("Psychrometric calculation error", error);
      return null;
    }
  });
}

export interface CurvePoint {
  dryBulb: number;
  humidityRatio: number;
  enthalpy: number;
}

export interface Curve {
  id: string;
  label: string;
  level: number;
  points: CurvePoint[];
}

export function generateRelativeHumidityCurves(
  system: UnitSystem,
  pressure: number,
  dryBulbRange: [number, number],
  levels: number[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
  step: number = system === "si" ? 1 : 2
): Curve[] {
  return withUnitSystem(system, () => {
    return levels.map((level) => {
      const points: CurvePoint[] = [];
      for (let t = dryBulbRange[0]; t <= dryBulbRange[1]; t += step) {
        try {
          const humidityRatio = psychrolib.GetHumRatioFromRelHum(t, level, pressure);
          const enthalpy = psychrolib.GetMoistAirEnthalpy(t, humidityRatio);
          points.push({ dryBulb: t, humidityRatio, enthalpy });
        } catch {
          // skip invalid combinations near saturation limits
        }
      }
      return {
        id: `rh-${Math.round(level * 100)}`,
        label: `${Math.round(level * 100)}% RH`,
        level,
        points,
      };
    });
  });
}

export function generateEnthalpyLines(
  system: UnitSystem,
  pressure: number,
  dryBulbRange: [number, number],
  enthalpyValues: number[] = system === "si" ? [10, 20, 40, 60, 80, 100] : [10, 20, 30, 40, 50],
  step: number = system === "si" ? 0.005 : 0.005
): Curve[] {
  return withUnitSystem(system, () => {
    return enthalpyValues.map((enthalpyTarget) => {
      const points: CurvePoint[] = [];
      for (
        let humidityRatio = 0;
        humidityRatio <= 0.06;
        humidityRatio += step
      ) {
        try {
          const dryBulb = psychrolib.GetTDryBulbFromEnthalpyAndHumRatio(
            enthalpyTarget,
            humidityRatio
          );
          if (dryBulb >= dryBulbRange[0] && dryBulb <= dryBulbRange[1]) {
            points.push({ dryBulb, humidityRatio, enthalpy: enthalpyTarget });
          }
        } catch {
          // ignore out of domain
        }
      }
      return {
        id: `h-${Math.round(enthalpyTarget)}`,
        label: `${Math.round(enthalpyTarget)} ${system === "si" ? "kJ/kg" : "Btu/lb"}`,
        level: enthalpyTarget,
        points,
      };
    });
  });
}

/**
 * Generates constant wet-bulb temperature curves.
 * Guards against invalid psychrolib responses to avoid propagating NaNs.
 */
export function generateWetBulbLines(
  system: UnitSystem,
  pressure: number,
  dryBulbRange: [number, number],
  wetBulbValues: number[],
  step: number
): Curve[] {
  return withUnitSystem(system, () => {
    return wetBulbValues.map((wetBulbTarget) => {
      if (!Number.isFinite(wetBulbTarget)) {
        return {
          id: `tw-${wetBulbTarget}`,
          label: `${wetBulbTarget}`,
          level: wetBulbTarget,
          points: [],
        };
      }

      const start = Math.max(wetBulbTarget, dryBulbRange[0]);
      const points: CurvePoint[] = [];
      for (let dryBulb = start; dryBulb <= dryBulbRange[1]; dryBulb += step) {
        try {
          const humidityRatio = psychrolib.GetHumRatioFromTWetBulb(
            dryBulb,
            wetBulbTarget,
            pressure
          );
          if (!Number.isFinite(humidityRatio)) continue;
          points.push({
            dryBulb,
            humidityRatio,
            enthalpy: psychrolib.GetMoistAirEnthalpy(dryBulb, humidityRatio),
          });
        } catch {
          continue;
        }
      }
      return {
        id: `tw-${wetBulbTarget}`,
        label: `${wetBulbTarget}°`,
        level: wetBulbTarget,
        points,
      };
    });
  });
}

/**
 * Generates constant specific-volume curves using a bounded binary search.
 * Returns empty curves when the requested volume is outside the feasible domain.
 */
export function generateSpecificVolumeLines(
  system: UnitSystem,
  pressure: number,
  dryBulbRange: [number, number],
  specificVolumeValues: number[],
  dryBulbStep: number,
  tolerance = 1e-4
): Curve[] {
  return withUnitSystem(system, () => {
    return specificVolumeValues.map((targetVolume) => {
      if (!Number.isFinite(targetVolume) || targetVolume <= 0) {
        return {
          id: `sv-${targetVolume}`,
          label: targetVolume.toFixed(system === "si" ? 2 : 3),
          level: targetVolume,
          points: [],
        };
      }

      const points: CurvePoint[] = [];
      for (
        let dryBulb = dryBulbRange[0];
        dryBulb <= dryBulbRange[1];
        dryBulb += dryBulbStep
      ) {
        try {
          const satHum = psychrolib.GetSatHumRatio(dryBulb, pressure);
          if (!Number.isFinite(satHum) || satHum <= 0) {
            continue;
          }
          let low = 0;
          let high = satHum;
          let humidityRatio = satHum;
          for (let i = 0; i < 25; i += 1) {
            const mid = (low + high) / 2;
            const volume = psychrolib.GetMoistAirVolume(
              dryBulb,
              mid,
              pressure
            );
            if (!Number.isFinite(volume)) break;
            if (Math.abs(volume - targetVolume) <= tolerance) {
              humidityRatio = mid;
              break;
            }
            if (volume > targetVolume) {
              high = mid;
            } else {
              low = mid;
            }
            humidityRatio = mid;
          }
          if (humidityRatio > 0 && humidityRatio <= satHum) {
            points.push({
              dryBulb,
              humidityRatio,
              enthalpy: psychrolib.GetMoistAirEnthalpy(dryBulb, humidityRatio),
            });
          }
        } catch {
          continue;
        }
      }
      return {
        id: `sv-${targetVolume}`,
        label: targetVolume.toFixed(system === "si" ? 2 : 3),
        level: targetVolume,
        points,
      };
    });
  });
}

export interface SaturationCurve {
  id: string;
  label: string;
  points: CurvePoint[];
}

export function generateSaturationCurve(
  system: UnitSystem,
  pressure: number,
  dryBulbRange: [number, number],
  step: number = system === "si" ? 0.5 : 1
): SaturationCurve {
  return withUnitSystem(system, () => {
    const points: CurvePoint[] = [];
    for (let t = dryBulbRange[0]; t <= dryBulbRange[1]; t += step) {
      try {
        const humidityRatio = psychrolib.GetSatHumRatio(t, pressure);
        const enthalpy = psychrolib.GetMoistAirEnthalpy(t, humidityRatio);
        points.push({ dryBulb: t, humidityRatio, enthalpy });
      } catch {
        // ignore
      }
    }
    return {
      id: "saturation",
      label: "100% RH",
      points,
    };
  });
}

export function humidityRatioToDisplay(
  system: UnitSystem,
  humidityRatio: number
): number {
  return system === "si" ? humidityRatio * 1000 : humidityRatio * 7000;
}

export function humidityRatioFromDisplay(
  system: UnitSystem,
  humidityRatio: number
): number {
  return system === "si" ? humidityRatio / 1000 : humidityRatio / 7000;
}

