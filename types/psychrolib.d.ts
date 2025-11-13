declare module "psychrolib" {
  interface PsychroLib {
    readonly IP: number;
    readonly SI: number;
    SetUnitSystem(system: number): void;
    GetHumRatioFromRelHum(
      dryBulb: number,
      relHum: number,
      pressure: number
    ): number;
    GetHumRatioFromTWetBulb(
      dryBulb: number,
      wetBulb: number,
      pressure: number
    ): number;
    GetTWetBulbFromHumRatio(
      dryBulb: number,
      humidityRatio: number,
      pressure: number
    ): number;
    GetTDewPointFromHumRatio(
      dryBulb: number,
      humidityRatio: number,
      pressure: number
    ): number;
    GetMoistAirEnthalpy(dryBulb: number, humidityRatio: number): number;
    GetMoistAirVolume(
      dryBulb: number,
      humidityRatio: number,
      pressure: number
    ): number;
    GetMoistAirDensity(
      dryBulb: number,
      humidityRatio: number,
      pressure: number
    ): number;
    GetVapPresFromHumRatio(humidityRatio: number, pressure: number): number;
    GetSatHumRatio(dryBulb: number, pressure: number): number;
    GetRelHumFromHumRatio(
      dryBulb: number,
      humidityRatio: number,
      pressure: number
    ): number;
    GetTDryBulbFromEnthalpyAndHumRatio(
      enthalpy: number,
      humidityRatio: number
    ): number;
  }

  const psychrolib: PsychroLib;
  export default psychrolib;
}

