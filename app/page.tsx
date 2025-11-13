"use client";

import { useCallback, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { PsychroChart } from "@/components/psychro-chart";
import {
  DEFAULT_INPUTS,
  computePsychrometrics,
  getChartExtents,
  humidityRatioToDisplay,
  type PsychroState,
  type PsychroInputs,
  type UnitSystem,
} from "@/lib/psychrometrics";

const PA_PER_PSI = 6_894.757293168;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const FORMATTERS = {
  temperature: new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }),
  humidityPercent: new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }),
  humidityRatioSI: new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }),
  humidityRatioIP: new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }),
  enthalpy: new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }),
  specificVolume: new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 3,
  }),
  density: new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 3,
  }),
  pressureSI: new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }),
  pressureIP: new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 3,
  }),
  vaporPressureSI: new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }),
  vaporPressureIP: new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 3,
  }),
};

const convertInputs = (
  inputs: PsychroInputs,
  from: UnitSystem,
  to: UnitSystem
): PsychroInputs => {
  if (from === to) {
    return { ...inputs };
  }

  if (from === "ip" && to === "si") {
    return {
      pressure: Math.round(inputs.pressure * PA_PER_PSI),
      dryBulb: Number.parseFloat(
        (((inputs.dryBulb - 32) * 5) / 9).toFixed(1)
      ),
      relativeHumidity: inputs.relativeHumidity,
    };
  }

  if (from === "si" && to === "ip") {
    return {
      pressure: Number.parseFloat(
        (inputs.pressure / PA_PER_PSI).toFixed(3)
      ),
      dryBulb: Number.parseFloat(((inputs.dryBulb * 9) / 5 + 32).toFixed(1)),
      relativeHumidity: inputs.relativeHumidity,
    };
  }

  return { ...inputs };
};

type PropertyField = {
  id: string;
  label: string;
  unit: Record<UnitSystem, string>;
  accessor: (
    state: PsychroState | null,
    inputs: PsychroInputs,
    system: UnitSystem
  ) => number | null;
  formatter: (value: number, system: UnitSystem) => string;
};

const PROPERTY_FIELDS: PropertyField[] = [
  {
    id: "pressure",
    label: "Pressure",
    unit: { si: "Pa", ip: "psia" },
    accessor: (_state, inputs) => inputs.pressure,
    formatter: (value, system) =>
      system === "si"
        ? FORMATTERS.pressureSI.format(value)
        : FORMATTERS.pressureIP.format(value),
  },
  {
    id: "dryBulb",
    label: "Dry Bulb",
    unit: { si: "°C", ip: "°F" },
    accessor: (state) => state?.dryBulb ?? null,
    formatter: (value) => FORMATTERS.temperature.format(value),
  },
  {
    id: "wetBulb",
    label: "Wet Bulb",
    unit: { si: "°C", ip: "°F" },
    accessor: (state) => state?.wetBulb ?? null,
    formatter: (value) => FORMATTERS.temperature.format(value),
  },
  {
    id: "dewPoint",
    label: "Dew Point",
    unit: { si: "°C", ip: "°F" },
    accessor: (state) => state?.dewPoint ?? null,
    formatter: (value) => FORMATTERS.temperature.format(value),
  },
  {
    id: "relativeHumidity",
    label: "Relative Humidity",
    unit: { si: "%", ip: "%" },
    accessor: (state) => state?.relativeHumidity ?? null,
    formatter: (value) => FORMATTERS.humidityPercent.format(value),
  },
  {
    id: "humidityRatio",
    label: "Humidity Ratio",
    unit: { si: "g/kg(d.a)", ip: "gr/lb(d.a)" },
    accessor: (state, _inputs, system) =>
      state
        ? humidityRatioToDisplay(system, state.humidityRatio)
        : null,
    formatter: (value, system) =>
      system === "si"
        ? FORMATTERS.humidityRatioSI.format(value)
        : FORMATTERS.humidityRatioIP.format(value),
  },
  {
    id: "enthalpy",
    label: "Enthalpy",
    unit: { si: "kJ/kg", ip: "Btu/lb" },
    accessor: (state) => state?.enthalpy ?? null,
    formatter: (value) => FORMATTERS.enthalpy.format(value),
  },
  {
    id: "specificVolume",
    label: "Specific Volume",
    unit: { si: "m³/kg", ip: "ft³/lb" },
    accessor: (state) => state?.specificVolume ?? null,
    formatter: (value) => FORMATTERS.specificVolume.format(value),
  },
  {
    id: "density",
    label: "Moist Air Density",
    unit: { si: "kg/m³", ip: "lb/ft³" },
    accessor: (state) => state?.density ?? null,
    formatter: (value) => FORMATTERS.density.format(value),
  },
  {
    id: "vaporPressure",
    label: "Vapor Pressure",
    unit: { si: "Pa", ip: "psi" },
    accessor: (state) => state?.vaporPressure ?? null,
    formatter: (value, system) =>
      system === "si"
        ? FORMATTERS.vaporPressureSI.format(value)
        : FORMATTERS.vaporPressureIP.format(value),
  },
];

export default function Home() {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("si");
  const [inputs, setInputs] = useState<PsychroInputs>({ ...DEFAULT_INPUTS.si });
  const [zoomLocked, setZoomLocked] = useState(false);
  const [showHoverCrosshair, setShowHoverCrosshair] = useState(true);
  const drynessStep = 0.5;
  const humidityStep = 0.5;

  const chartExtents = useMemo(
    () => getChartExtents(unitSystem),
    [unitSystem]
  );

  const psychroState = useMemo(
    () => computePsychrometrics(inputs, unitSystem),
    [inputs, unitSystem]
  );

  const properties = useMemo(() => {
    return PROPERTY_FIELDS.map((field) => {
      const rawValue = field.accessor(psychroState, inputs, unitSystem);
      return {
        id: field.id,
        label: field.label,
        unit: field.unit[unitSystem],
        value:
          rawValue == null || Number.isNaN(rawValue)
            ? "--"
            : field.formatter(rawValue, unitSystem),
      };
    });
  }, [psychroState, inputs, unitSystem]);

  const invalidState = psychroState === null;

  const handleReset = () => {
    setInputs({ ...DEFAULT_INPUTS[unitSystem] });
  };

  const handleUnitToggle = (next: boolean) => {
    const nextSystem: UnitSystem = next ? "ip" : "si";
    setInputs((prev) => {
      const converted = convertInputs(prev, unitSystem, nextSystem);
      const nextExtents = getChartExtents(nextSystem);
      return {
        pressure: Math.max(converted.pressure, 0),
        dryBulb: Number.parseFloat(
          clamp(
            converted.dryBulb,
            nextExtents.dryBulb[0],
            nextExtents.dryBulb[1]
          ).toFixed(1)
        ),
        relativeHumidity: Number.parseFloat(
          clamp(converted.relativeHumidity, 0, 100).toFixed(1)
        ),
      };
    });
    setUnitSystem(nextSystem);
  };

  const handleInputChange =
    (key: keyof PsychroInputs) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number.parseFloat(event.target.value);
      setInputs((prev) => ({
        ...prev,
        [key]: (() => {
          if (!Number.isFinite(value)) return prev[key];
          if (key === "pressure") {
            return Math.max(value, 0);
          }
          if (key === "dryBulb") {
            return Number.parseFloat(
              clamp(value, chartExtents.dryBulb[0], chartExtents.dryBulb[1]).toFixed(1)
            );
          }
          if (key === "relativeHumidity") {
            return Number.parseFloat(clamp(value, 0, 100).toFixed(1));
          }
          return value;
        })(),
      }));
    };

  const handleChartState = useCallback(
    (state: PsychroState) => {
      setInputs((prev) => ({
        ...prev,
        dryBulb: Number(
          clamp(state.dryBulb, chartExtents.dryBulb[0], chartExtents.dryBulb[1]).toFixed(3)
        ),
        relativeHumidity: Number(clamp(state.relativeHumidity, 0, 100).toFixed(3)),
      }));
    },
    [chartExtents]
  );

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground">
      <div className="flex flex-1 overflow-hidden">
        <aside className="flex h-full w-full max-w-[340px] flex-col border-r border-border/60 bg-card/20 backdrop-blur-xl">
        <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-2"
          >
            <h1 className="text-xl font-semibold tracking-tight">
              Psychro Chart Studio
            </h1>
            <p className="text-xs text-muted-foreground">
              Configure the ambient state, hover for crosshair guidance, and click on the
              canvas to sample psychrometric properties.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="space-y-3 rounded-xl border border-border/60 bg-background/60 p-4"
          >
            <p className="text-xs font-medium text-muted-foreground">
              Active units: {unitSystem === "si" ? "Metric (SI)" : "Imperial (IP)"}
            </p>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="pressure">Atmospheric pressure</Label>
                <Input
                  id="pressure"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={unitSystem === "si" ? 100 : 0.1}
                  value={inputs.pressure}
                  onChange={handleInputChange("pressure")}
                  className="border-border/50 bg-background/70"
                />
                <p className="text-xs text-muted-foreground">
                  {unitSystem === "si" ? "Pa (absolute)" : "psia"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dry-bulb">Dry bulb temperature</Label>
                <Input
                  id="dry-bulb"
                  type="number"
                  inputMode="decimal"
                  step={drynessStep}
                  value={inputs.dryBulb}
                  onChange={handleInputChange("dryBulb")}
                  className="border-border/50 bg-background/70"
                />
                <Slider
                  value={[inputs.dryBulb]}
                  min={chartExtents.dryBulb[0]}
                  max={chartExtents.dryBulb[1]}
                  step={drynessStep}
                  onValueChange={([value]) =>
                    setInputs((prev) => ({
                      ...prev,
                      dryBulb: Number.parseFloat(
                        clamp(
                          value,
                          chartExtents.dryBulb[0],
                          chartExtents.dryBulb[1]
                        ).toFixed(1)
                      ),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {unitSystem === "si" ? "°C" : "°F"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="relative-humidity">Relative humidity</Label>
                <Input
                  id="relative-humidity"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={humidityStep}
                  value={inputs.relativeHumidity}
                  onChange={handleInputChange("relativeHumidity")}
                  className="border-border/50 bg-background/70"
                />
                <Slider
                  value={[inputs.relativeHumidity]}
                  min={0}
                  max={100}
                  step={humidityStep}
                  onValueChange={([value]) =>
                    setInputs((prev) => ({
                      ...prev,
                      relativeHumidity: Number.parseFloat(
                        clamp(value, 0, 100).toFixed(1)
                      ),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">%</p>
              </div>
            </div>

            <Button
              className="w-full border border-border/60 bg-background hover:bg-background/70"
              variant="outline"
              onClick={handleReset}
            >
              Reset inputs
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12 }}
            className="rounded-xl border border-border/60 bg-background/60 p-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Psychrometric properties
              </h2>
              <span className="text-[10px] uppercase text-muted-foreground">
                Live results
              </span>
            </div>
            {invalidState && (
              <div className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Current inputs do not map to a physical air state. Adjust your
                dry bulb, humidity, or pressure.
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs md:text-sm">
              {properties.map((property) => (
                <div
                  key={property.id}
                  className="rounded-lg border border-border/40 bg-background/50 px-3 py-2"
                >
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {property.label}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {property.value}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {property.unit}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </aside>

        <main className="flex flex-1 flex-col bg-[#020202]">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 px-6 py-4"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                Hover for crosshair guidance, click to lock a state point.
              </p>
              <p className="text-xs text-muted-foreground">
                Scroll to zoom and reveal higher-resolution gridlines. Double-click to reset.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Units</span>
                <div className="inline-flex items-center gap-2">
                  <span>SI</span>
                  <Switch
                    role="switch"
                    checked={unitSystem === "ip"}
                    onCheckedChange={handleUnitToggle}
                    aria-label="Toggle unit system"
                  />
                  <span>IP</span>
                </div>
                <span className="text-[11px] text-muted-foreground/80">
                  {unitSystem === "si" ? "Metric" : "Imperial"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex h-2 w-2 rounded-full bg-chart-magenta" />
                <span>Saturation</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex h-2 w-2 rounded-full bg-chart-sky" />
                <span>Relative Humidity</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex h-2 w-2 rounded-full bg-chart-amber" />
                <span>Enthalpy</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400/80" />
                <span>Wet Bulb</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex h-2 w-2 rounded-full bg-slate-400/70" />
                <span>Specific Volume</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  id="zoom-lock"
                  checked={zoomLocked}
                  onCheckedChange={setZoomLocked}
                  aria-label="Toggle zoom lock"
                />
                <Label htmlFor="zoom-lock" className="text-xs text-muted-foreground">
                  Lock zoom
                </Label>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  id="hover-crosshair"
                  checked={showHoverCrosshair}
                  onCheckedChange={setShowHoverCrosshair}
                  aria-label="Toggle hover crosshair"
                />
                <Label htmlFor="hover-crosshair" className="text-xs text-muted-foreground">
                  Hover crosshair
                </Label>
              </div>
            </div>
          </motion.div>

          <div className="flex-1 px-4 pb-4 pt-3 md:px-6 md:pb-6">
            <div className="h-full rounded-2xl border border-border/60 bg-[#000000] shadow-ambient">
              <PsychroChart
                unitSystem={unitSystem}
                pressure={inputs.pressure}
                selectedState={psychroState ?? undefined}
                onSelectState={handleChartState}
                zoomLocked={zoomLocked}
                showHoverCrosshair={showHoverCrosshair}
              />
            </div>
          </div>
        </main>
      </div>
      <footer className="border-t border-border/60 bg-background/80 px-6 py-4 text-xs text-muted-foreground">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <span>&copy; {new Date().getFullYear()} Katakuri</span>
          <nav className="flex flex-wrap items-center gap-4">
            <a
              href="https://github.com/Katakuri004"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
            <a
              href="https://www.linkedin.com/in/arpit-kumar-kata/"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              LinkedIn
            </a>
            <a
              href="https://www.instagram.com/katakuri.2004/"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Instagram
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
