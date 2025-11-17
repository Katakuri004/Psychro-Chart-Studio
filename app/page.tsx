"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type ProcessKind = "heating" | "cooling" | "humidifying" | "mixing";

type SavedPoint = {
  id: string;
  label: string;
  color: string;
  dryBulbSI: number;
  relativeHumidity: number;
  humidityRatio: number;
  pressureSI: number;
};

type ProcessLink = {
  id: string;
  fromId: string;
  toId: string;
  kind: ProcessKind;
};

type ChartStatePoint = {
  id: string;
  label: string;
  color: string;
  dryBulb: number;
  humidityRatio: number;
};

type ChartProcess = {
  id: string;
  color: string;
  label: string;
  points: Array<{ dryBulb: number; humidityRatio: number }>;
};

type ComparisonRun = {
  id: string;
  label: string;
  color: string;
  active: boolean;
  points: SavedPoint[];
  processes: ProcessLink[];
};

type ScenarioTemplatePoint = {
  label: string;
  dryBulb: number;
  relativeHumidity: number;
  color?: string;
  note?: string;
};

type ScenarioTemplateProcess = {
  fromLabel: string;
  toLabel: string;
  kind: ProcessKind;
};

type ScenarioTemplate = {
  id: string;
  name: string;
  summary: string;
  inputs: Record<UnitSystem, PsychroInputs>;
  points: ScenarioTemplatePoint[];
  processes: ScenarioTemplateProcess[];
  insights: string[];
};

type SnapshotPayload = {
  unitSystem: UnitSystem;
  inputs: PsychroInputs;
  savedPoints: SavedPoint[];
  processes: ProcessLink[];
  comparisonRuns: Array<Omit<ComparisonRun, "active">>;
  activeTemplateId: string | null;
};

const POINT_COLORS = [
  "#22d3ee",
  "#38bdf8",
  "#c084fc",
  "#f472b6",
  "#f97316",
  "#a3e635",
];

const PROCESS_COLORS: Record<ProcessKind, string> = {
  heating: "#f97316",
  cooling: "#0ea5e9",
  humidifying: "#22c55e",
  mixing: "#eab308",
};

const RUN_COLORS = ["#ec4899", "#c084fc", "#10b981", "#facc15", "#38bdf8"];
const SHARE_PARAM_KEY = "snapshot";

const createTemplateInputs = (
  inputs: PsychroInputs
): Record<UnitSystem, PsychroInputs> => ({
  si: inputs,
  ip: convertInputs(inputs, "si", "ip"),
});

const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: "doas",
    name: "DOAS Commissioning",
    summary: "Dedicated outdoor air stream staged through energy recovery and cooling coils.",
    insights: [
      "Target coil leaving dew point < 12°C (54°F) for latent control.",
      "Parallel terminals reheat to room-neutral supply.",
    ],
    inputs: createTemplateInputs({
      pressure: 101_325,
      dryBulb: 30,
      relativeHumidity: 60,
    }),
    points: [
      {
        label: "OA",
        dryBulb: 30,
        relativeHumidity: 60,
        color: "#38bdf8",
        note: "Outdoor design air",
      },
      {
        label: "HX",
        dryBulb: 21,
        relativeHumidity: 95,
        color: "#f472b6",
        note: "After enthalpy wheel",
      },
      {
        label: "SA",
        dryBulb: 13,
        relativeHumidity: 90,
        color: "#22c55e",
        note: "Coil leaving condition",
      },
    ],
    processes: [
      { fromLabel: "OA", toLabel: "HX", kind: "cooling" },
      { fromLabel: "HX", toLabel: "SA", kind: "cooling" },
    ],
  },
  {
    id: "data-center",
    name: "Data Hall Loop",
    summary: "CRAH coil loop between cold aisle supply and hot aisle return.",
    insights: [
      "Maintain dew point margin > 6°C (10°F).",
      "Overlay with sensor data to validate ΔT.",
    ],
    inputs: createTemplateInputs({
      pressure: 101_325,
      dryBulb: 24,
      relativeHumidity: 45,
    }),
    points: [
      {
        label: "CR",
        dryBulb: 18,
        relativeHumidity: 50,
        color: "#0ea5e9",
        note: "Cold aisle supply",
      },
      {
        label: "SR",
        dryBulb: 32,
        relativeHumidity: 20,
        color: "#f97316",
        note: "Server return",
      },
      {
        label: "MX",
        dryBulb: 22,
        relativeHumidity: 30,
        color: "#a3e635",
        note: "Mixed air",
      },
    ],
    processes: [
      { fromLabel: "CR", toLabel: "SR", kind: "heating" },
      { fromLabel: "SR", toLabel: "MX", kind: "cooling" },
    ],
  },
  {
    id: "greenhouse",
    name: "Greenhouse Daycycle",
    summary: "Track evapotranspiration from dawn to purge.",
    insights: [
      "Plan vents before humidity ratio crosses 0.014 kg/kg.",
      "Evening purge protects structures overnight.",
    ],
    inputs: createTemplateInputs({
      pressure: 98_000,
      dryBulb: 26,
      relativeHumidity: 70,
    }),
    points: [
      {
        label: "AM",
        dryBulb: 18,
        relativeHumidity: 85,
        color: "#22d3ee",
        note: "Morning baseline",
      },
      {
        label: "PD",
        dryBulb: 26,
        relativeHumidity: 60,
        color: "#facc15",
        note: "Peak daylight",
      },
      {
        label: "EV",
        dryBulb: 30,
        relativeHumidity: 55,
        color: "#fb7185",
        note: "Evening purge",
      },
    ],
    processes: [
      { fromLabel: "AM", toLabel: "PD", kind: "heating" },
      { fromLabel: "PD", toLabel: "EV", kind: "mixing" },
    ],
  },
];

const toBase64Url = (value: string) => {
  if (typeof window === "undefined") {
    return Buffer.from(value, "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  const base64 = window.btoa(unescape(encodeURIComponent(value)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  if (typeof window === "undefined") {
    return Buffer.from(padded, "base64").toString("utf-8");
  }
  const decoded = window.atob(padded);
  return decodeURIComponent(
    decoded
      .split("")
      .map((char) => "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
};

const encodeSnapshotPayload = (payload: unknown) =>
  toBase64Url(JSON.stringify(payload));

const decodeSnapshotPayload = <T,>(value: string): T =>
  JSON.parse(fromBase64Url(value));

const buildTemplateSavedPoints = (
  template: ScenarioTemplate
): SavedPoint[] => {
  const pressureSI = template.inputs.si.pressure;
  return template.points
    .map((point, index) => {
      const result = computePsychrometrics(
        {
          pressure: pressureSI,
          dryBulb: point.dryBulb,
          relativeHumidity: point.relativeHumidity,
        },
        "si"
      );
      if (!result) return null;
      return {
        id: `${template.id}-${point.label}-${index}`,
        label: point.label,
        color: point.color ?? POINT_COLORS[index % POINT_COLORS.length],
        dryBulbSI: result.dryBulb,
        relativeHumidity: result.relativeHumidity,
        humidityRatio: result.humidityRatio,
        pressureSI,
      };
    })
    .filter((value): value is SavedPoint => Boolean(value));
};

const buildTemplateProcesses = (
  template: ScenarioTemplate,
  points: SavedPoint[]
): ProcessLink[] => {
  const map = new Map(points.map((point) => [point.label, point.id]));
  return template.processes
    .map((process, index) => {
      const fromId = map.get(process.fromLabel);
      const toId = map.get(process.toLabel);
      if (!fromId || !toId) return null;
      return {
        id: `${template.id}-${index}`,
        fromId,
        toId,
        kind: process.kind,
      };
    })
    .filter((value): value is ProcessLink => Boolean(value));
};

function convertInputs(
  inputs: PsychroInputs,
  from: UnitSystem,
  to: UnitSystem
): PsychroInputs {
  if (from === to) {
    return { ...inputs };
  }

  if (from === "ip" && to === "si") {
    return {
      pressure: Math.round(inputs.pressure * PA_PER_PSI),
      dryBulb: Number.parseFloat((((inputs.dryBulb - 32) * 5) / 9).toFixed(1)),
      relativeHumidity: inputs.relativeHumidity,
    };
  }

  if (from === "si" && to === "ip") {
    return {
      pressure: Number.parseFloat((inputs.pressure / PA_PER_PSI).toFixed(3)),
      dryBulb: Number.parseFloat(((inputs.dryBulb * 9) / 5 + 32).toFixed(1)),
      relativeHumidity: inputs.relativeHumidity,
    };
  }

  return { ...inputs };
}

const toCelsius = (value: number, system: UnitSystem) =>
  system === "si" ? value : ((value - 32) * 5) / 9;

const fromCelsius = (value: number, system: UnitSystem) =>
  system === "si" ? value : value * (9 / 5) + 32;

const toPressureSI = (value: number, system: UnitSystem) =>
  system === "si" ? value : value * PA_PER_PSI;

const createId = () => Math.random().toString(36).slice(2, 9);

const generateLabel = (count: number) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (count < alphabet.length) return alphabet[count];
  return `P${count - alphabet.length + 1}`;
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
  const [comparisonRuns, setComparisonRuns] = useState<ComparisonRun[]>([]);
  const [comparisonLabel, setComparisonLabel] = useState("Run 1");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">(
    "idle"
  );
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const drynessStep = 0.5;
  const humidityStep = 0.5;
  const [savedPoints, setSavedPoints] = useState<SavedPoint[]>([]);
  const [processes, setProcesses] = useState<ProcessLink[]>([]);
  const [processDraft, setProcessDraft] = useState<{
    fromId: string;
    toId: string;
    kind: ProcessKind;
  }>({
    fromId: "",
    toId: "",
    kind: "heating",
  });
  const snapshotHydratedRef = useRef(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (snapshotHydratedRef.current) return;
    if (typeof window === "undefined") return;
    const encoded = new URLSearchParams(window.location.search).get(
      SHARE_PARAM_KEY
    );
    if (!encoded) {
      snapshotHydratedRef.current = true;
      return;
    }
    try {
      const payload = decodeSnapshotPayload<SnapshotPayload>(encoded);
      if (payload.unitSystem) setUnitSystem(payload.unitSystem);
      if (payload.inputs) setInputs(payload.inputs);
      if (payload.savedPoints) setSavedPoints(payload.savedPoints);
      if (payload.processes) setProcesses(payload.processes);
      if (payload.comparisonRuns) {
        setComparisonRuns(
          payload.comparisonRuns.map((run) => ({
            ...run,
            active: true,
          }))
        );
      }
      setActiveTemplateId(payload.activeTemplateId ?? null);
    } catch (error) {
      console.error("Failed to decode snapshot", error);
      setShareStatus("error");
    } finally {
      snapshotHydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (shareStatus === "idle") return;
    const timer = window.setTimeout(() => setShareStatus("idle"), 2400);
    return () => window.clearTimeout(timer);
  }, [shareStatus]);

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

  const handleCaptureState = () => {
    if (!psychroState) return;
    const newPoint: SavedPoint = {
      id: createId(),
      label: generateLabel(savedPoints.length),
      color: POINT_COLORS[savedPoints.length % POINT_COLORS.length],
      dryBulbSI: toCelsius(psychroState.dryBulb, unitSystem),
      relativeHumidity: clamp(psychroState.relativeHumidity, 0, 100),
      humidityRatio: psychroState.humidityRatio,
      pressureSI: toPressureSI(inputs.pressure, unitSystem),
    };
    setSavedPoints((prev) => [...prev, newPoint]);
  };

  const handlePointLabelChange = (id: string, label: string) => {
    setSavedPoints((prev) =>
      prev.map((point) => (point.id === id ? { ...point, label } : point))
    );
  };

  const handleRemovePoint = (id: string) => {
    setSavedPoints((prev) => prev.filter((point) => point.id !== id));
    setProcesses((prev) =>
      prev.filter((process) => process.fromId !== id && process.toId !== id)
    );
    setProcessDraft((prev) => ({
      ...prev,
      fromId: prev.fromId === id ? "" : prev.fromId,
      toId: prev.toId === id ? "" : prev.toId,
    }));
  };

  const handleProcessDraftChange = (
    field: keyof typeof processDraft,
    value: string
  ) => {
    setProcessDraft((prev) => ({
      ...prev,
      [field]: field === "kind" ? (value as ProcessKind) : value,
    }));
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = SCENARIO_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const templatePoints = buildTemplateSavedPoints(template);
    const templateProcesses = buildTemplateProcesses(template, templatePoints);
    setInputs({ ...template.inputs[unitSystem] });
    setSavedPoints(templatePoints);
    setProcesses(templateProcesses);
    setActiveTemplateId(template.id);
  };

  const handleOverlayTemplate = (templateId: string) => {
    const template = SCENARIO_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const templatePoints = buildTemplateSavedPoints(template);
    const templateProcesses = buildTemplateProcesses(template, templatePoints);
    const runId = createId();
    const color = RUN_COLORS[comparisonRuns.length % RUN_COLORS.length];
    const clonedPoints = templatePoints.map((point, index) => ({
      ...point,
      id: `${runId}-${index}-${point.id}`,
    }));
    const idMap = new Map(
      templatePoints.map((point, index) => [point.id, clonedPoints[index].id])
    );
    const clonedProcesses = templateProcesses.map((process, index) => ({
      ...process,
      id: `${runId}-${index}-${process.id}`,
      fromId: idMap.get(process.fromId) ?? process.fromId,
      toId: idMap.get(process.toId) ?? process.toId,
    }));
    setComparisonRuns((prev) => [
      ...prev,
      {
        id: runId,
        label: `${template.name} overlay`,
        color,
        active: true,
        points: clonedPoints,
        processes: clonedProcesses,
      },
    ]);
  };

  const handleAddProcess = () => {
    const { fromId, toId, kind } = processDraft;
    if (!fromId || !toId || fromId === toId) return;
    setProcesses((prev) => [
      ...prev,
      {
        id: createId(),
        fromId,
        toId,
        kind,
      },
    ]);
    setProcessDraft((prev) => ({ ...prev, toId: "" }));
  };

  const handleSaveComparisonRun = () => {
    if (savedPoints.length === 0) return;
    const label =
      comparisonLabel.trim() || `Run ${comparisonRuns.length + 1}`;
    const runId = createId();
    const color = RUN_COLORS[comparisonRuns.length % RUN_COLORS.length];
    const clonedPoints = savedPoints.map((point, index) => ({
      ...point,
      id: `${runId}-${index}-${point.id}`,
    }));
    const idMap = new Map(
      savedPoints.map((point, index) => [point.id, clonedPoints[index].id])
    );
    const clonedProcesses = processes.map((process, index) => ({
      ...process,
      id: `${runId}-${index}-${process.id}`,
      fromId: idMap.get(process.fromId) ?? process.fromId,
      toId: idMap.get(process.toId) ?? process.toId,
    }));
    setComparisonRuns((prev) => [
      ...prev,
      {
        id: runId,
        label,
        color,
        active: true,
        points: clonedPoints,
        processes: clonedProcesses,
      },
    ]);
    setComparisonLabel(`Run ${comparisonRuns.length + 2}`);
  };

  const handleToggleRun = (id: string) => {
    setComparisonRuns((prev) =>
      prev.map((run) =>
        run.id === id ? { ...run, active: !run.active } : run
      )
    );
  };

  const handleRemoveRun = (id: string) => {
    setComparisonRuns((prev) => prev.filter((run) => run.id !== id));
  };

  const handleCopySnapshotLink = async () => {
    if (typeof window === "undefined") return;
    try {
      const payload: SnapshotPayload = {
        unitSystem,
        inputs,
        savedPoints,
        processes,
        activeTemplateId,
        comparisonRuns: comparisonRuns
          .filter((run) => run.active)
          .map((run) => {
            const { active, ...rest } = run;
            void active;
            return rest;
          }),
      };
      const encoded = encodeSnapshotPayload(payload);
      const url = new URL(window.location.href);
      url.searchParams.set(SHARE_PARAM_KEY, encoded);
      if (!navigator.clipboard) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(url.toString());
      setShareStatus("copied");
    } catch (error) {
      console.error("Failed to copy snapshot link", error);
      setShareStatus("error");
    }
  };

  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    setIsExportingPdf(true);
    try {
      const [html2canvas, jsPDFModule] = await Promise.all([
        import("html2canvas").then((mod) => mod.default),
        import("jspdf").then((mod) => mod.jsPDF),
      ]);
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: "#020617",
        scale: 2,
      });
      const imageData = canvas.toDataURL("image/png", 1);
      const pdf = new jsPDFModule("landscape", "pt", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
      const renderWidth = canvas.width * ratio;
      const renderHeight = canvas.height * ratio;
      const offsetX = (pageWidth - renderWidth) / 2;
      const offsetY = (pageHeight - renderHeight) / 2;
      pdf.addImage(imageData, "PNG", offsetX, offsetY, renderWidth, renderHeight);
      pdf.save(`psychro-chart-${Date.now()}.pdf`);
    } catch (error) {
      console.error("Failed to export PDF", error);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const baseChartPoints = useMemo<ChartStatePoint[]>(() => {
    return savedPoints.map((point) => ({
      id: point.id,
      label: point.label,
      color: point.color,
      dryBulb: fromCelsius(point.dryBulbSI, unitSystem),
      humidityRatio: point.humidityRatio,
    }));
  }, [savedPoints, unitSystem]);

  const overlayChartPoints = useMemo<ChartStatePoint[]>(() => {
    return comparisonRuns
      .filter((run) => run.active)
      .flatMap((run) =>
        run.points.map((point) => ({
          id: `${run.id}-${point.id}`,
          label: `${run.label} · ${point.label}`,
          color: run.color,
          dryBulb: fromCelsius(point.dryBulbSI, unitSystem),
          humidityRatio: point.humidityRatio,
        }))
      );
  }, [comparisonRuns, unitSystem]);

  const chartStatePoints = useMemo(
    () => [...baseChartPoints, ...overlayChartPoints],
    [baseChartPoints, overlayChartPoints]
  );

  const baseChartProcesses = useMemo<ChartProcess[]>(() => {
    const map = new Map(baseChartPoints.map((point) => [point.id, point]));
    return processes
      .map((process) => {
        const from = map.get(process.fromId);
        const to = map.get(process.toId);
        if (!from || !to) return null;
        return {
          id: process.id,
          color: PROCESS_COLORS[process.kind],
          label: `${from.label} → ${to.label}`,
          points: [
            { dryBulb: from.dryBulb, humidityRatio: from.humidityRatio },
            { dryBulb: to.dryBulb, humidityRatio: to.humidityRatio },
          ],
        };
      })
      .filter((value): value is ChartProcess => Boolean(value));
  }, [baseChartPoints, processes]);

  const overlayChartProcesses = useMemo<ChartProcess[]>(() => {
    return comparisonRuns
      .filter((run) => run.active)
      .flatMap((run) => {
        const map = new Map(
          run.points.map((point) => [point.id, point])
        );
        return run.processes
          .map((process) => {
            const from = map.get(process.fromId);
            const to = map.get(process.toId);
            if (!from || !to) return null;
            return {
              id: `${run.id}-${process.id}`,
              color: run.color,
              label: `${run.label}: ${from.label} → ${to.label}`,
              points: [
                {
                  dryBulb: fromCelsius(from.dryBulbSI, unitSystem),
                  humidityRatio: from.humidityRatio,
                },
                {
                  dryBulb: fromCelsius(to.dryBulbSI, unitSystem),
                  humidityRatio: to.humidityRatio,
                },
              ],
            };
          })
          .filter((value): value is ChartProcess => Boolean(value));
      });
  }, [comparisonRuns, unitSystem]);

  const chartProcesses = useMemo(
    () => [...baseChartProcesses, ...overlayChartProcesses],
    [baseChartProcesses, overlayChartProcesses]
  );

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <div className="flex flex-1 flex-col overflow-hidden lg:h-screen lg:flex-row">
        <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-r border-[hsla(var(--border),0.6)] bg-[hsla(var(--card),0.2)] backdrop-blur-xl lg:w-auto lg:basis-[320px] xl:basis-[360px]">
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4 md:p-5">
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
            className="space-y-3 rounded-xl border border-[hsla(var(--border),0.6)] bg-[hsla(var(--background),0.6)] p-4"
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
                  className="border-[hsla(var(--border),0.5)] bg-[hsla(var(--background),0.7)]"
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
                  className="border-[hsla(var(--border),0.5)] bg-[hsla(var(--background),0.7)]"
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
                  className="border-[hsla(var(--border),0.5)] bg-[hsla(var(--background),0.7)]"
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
              className="w-full border border-[hsla(var(--border),0.6)] bg-background hover:bg-[hsla(var(--background),0.7)]"
              variant="outline"
              onClick={handleReset}
            >
              Reset inputs
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="rounded-xl border border-[hsla(var(--border),0.6)] bg-[hsla(var(--background),0.6)] p-4"
          >
            <Tabs defaultValue="properties" className="w-full">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <TabsList className="flex w-full gap-1 rounded-lg border border-[hsla(var(--border),0.5)] bg-[hsla(var(--background),0.4)] p-1 text-xs md:w-auto">
                  <TabsTrigger
                    value="properties"
                    className="h-auto rounded-md px-3 py-1 text-[11px] font-semibold data-[state=active]:bg-[hsla(var(--foreground),0.1)] data-[state=active]:text-foreground"
                  >
                    Properties
                  </TabsTrigger>
                  <TabsTrigger
                    value="processes"
                    className="h-auto rounded-md px-3 py-1 text-[11px] font-semibold data-[state=active]:bg-[hsla(var(--foreground),0.1)] data-[state=active]:text-foreground"
                  >
                    Processes
                  </TabsTrigger>
                </TabsList>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCaptureState}
                  disabled={!psychroState}
                  className="h-9 w-full text-xs md:w-auto"
                >
                  Capture current state
                </Button>
              </div>

              <TabsContent value="properties" className="mt-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Psychrometric properties
                  </h2>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    Live results
                  </span>
                </div>
                {invalidState && (
                  <div className="mt-3 rounded-lg border border-[hsla(var(--destructive),0.5)] bg-[hsla(var(--destructive),0.1)] px-3 py-2 text-xs text-destructive">
                    Current inputs do not map to a physical air state. Adjust your
                    dry bulb, humidity, or pressure.
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs md:text-sm">
                  {properties.map((property) => (
                    <div
                      key={property.id}
                      className="rounded-lg border border-[hsla(var(--border),0.4)] bg-[hsla(var(--background),0.5)] px-3 py-2"
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
              </TabsContent>

              <TabsContent value="processes" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Saved states
                    </p>
                    {savedPoints.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {savedPoints.length} point{savedPoints.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {savedPoints.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No saved states yet. Capture a point to begin.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {savedPoints.map((point) => {
                        const displayDryBulb = FORMATTERS.temperature.format(
                          fromCelsius(point.dryBulbSI, unitSystem)
                        );
                        return (
                          <div
                            key={point.id}
                            className="flex flex-col gap-2 rounded-lg border border-[hsla(var(--border),0.4)] bg-[hsla(var(--background),0.5)] px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-flex h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: point.color }}
                              />
                              <Input
                                value={point.label}
                                onChange={(event) =>
                                  handlePointLabelChange(point.id, event.target.value)
                                }
                                className="h-8 flex-1 border-[hsla(var(--border),0.4)] bg-[hsla(var(--background),0.7)] text-xs"
                                aria-label={`Label for ${point.label}`}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground"
                                onClick={() => handleRemovePoint(point.id)}
                              >
                                ×
                              </Button>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                              <div>
                                <p className="uppercase tracking-wide">Dry Bulb</p>
                                <p className="font-semibold text-foreground">
                                  {displayDryBulb} {unitSystem === "si" ? "°C" : "°F"}
                                </p>
                              </div>
                              <div>
                                <p className="uppercase tracking-wide">Rel Hum</p>
                                <p className="font-semibold text-foreground">
                                  {FORMATTERS.humidityPercent.format(point.relativeHumidity)}%
                                </p>
                              </div>
                              <div>
                                <p className="uppercase tracking-wide">Hum Ratio</p>
                                <p className="font-semibold text-foreground">
                                  {unitSystem === "si"
                                    ? FORMATTERS.humidityRatioSI.format(
                                        humidityRatioToDisplay(unitSystem, point.humidityRatio)
                                      )
                                    : FORMATTERS.humidityRatioIP.format(
                                        humidityRatioToDisplay(unitSystem, point.humidityRatio)
                                      )}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Processes
                    </p>
                    {processes.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {processes.length} link{processes.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={processDraft.fromId}
                      onChange={(event) =>
                        handleProcessDraftChange("fromId", event.target.value)
                      }
                      className="h-8 rounded-md border border-[hsla(var(--border),0.4)] bg-[hsla(var(--background),0.7)] px-2 text-[11px]"
                    >
                      <option value="">From</option>
                      {savedPoints.map((point) => (
                        <option key={point.id} value={point.id}>
                          {point.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={processDraft.toId}
                      onChange={(event) =>
                        handleProcessDraftChange("toId", event.target.value)
                      }
                      className="h-8 rounded-md border border-[hsla(var(--border),0.4)] bg-[hsla(var(--background),0.7)] px-2 text-[11px]"
                    >
                      <option value="">To</option>
                      {savedPoints.map((point) => (
                        <option key={point.id} value={point.id}>
                          {point.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={processDraft.kind}
                      onChange={(event) =>
                        handleProcessDraftChange("kind", event.target.value)
                      }
                      className="col-span-2 h-8 rounded-md border border-[hsla(var(--border),0.4)] bg-[hsla(var(--background),0.7)] px-2 text-[11px] sm:col-span-1"
                    >
                      <option value="heating">Heating</option>
                      <option value="cooling">Cooling</option>
                      <option value="humidifying">Humidifying</option>
                      <option value="mixing">Mixing</option>
                    </select>
                    <Button
                      size="sm"
                      onClick={handleAddProcess}
                      disabled={savedPoints.length < 2}
                      className="col-span-2 h-8 text-xs"
                    >
                      Add process
                    </Button>
                  </div>
                <div className="space-y-2 rounded-xl border border-[hsla(var(--border),0.5)] bg-[hsla(var(--background),0.3)] p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Comparison runs
                    </p>
                    {comparisonRuns.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {comparisonRuns.filter((run) => run.active).length}/{comparisonRuns.length} visible
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={comparisonLabel}
                      onChange={(event) => setComparisonLabel(event.target.value)}
                      placeholder="Label this run"
                      className="h-9 border-[hsla(var(--border),0.4)] bg-[hsla(var(--background),0.7)] text-xs"
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveComparisonRun}
                      disabled={savedPoints.length === 0}
                      className="h-9 text-xs"
                    >
                      Save run
                    </Button>
                  </div>
                  {comparisonRuns.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Capture at least one point to create reusable overlays.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {comparisonRuns.map((run) => (
                        <div
                          key={run.id}
                          className="rounded-lg border border-[hsla(var(--border),0.4)] bg-[hsla(var(--background),0.6)] p-3 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-flex h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: run.color }}
                              />
                              <p className="font-semibold">{run.label}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                id={`run-${run.id}`}
                                checked={run.active}
                                onCheckedChange={() => handleToggleRun(run.id)}
                                aria-label={`Toggle ${run.label}`}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground"
                                onClick={() => handleRemoveRun(run.id)}
                              >
                                ×
                              </Button>
                            </div>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {run.points.length} point{run.points.length === 1 ? "" : "s"} ·{" "}
                            {run.processes.length} process{run.processes.length === 1 ? "" : "es"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </aside>

        <main className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden bg-[#020202]">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="flex flex-shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[hsla(var(--border),0.6)] px-6 py-4"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                Hover for crosshair guidance, click to lock a state point.
              </p>
              <p className="text-xs text-muted-foreground">
                Scroll to zoom and reveal higher-resolution gridlines. Double-click to reset.
              </p>
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
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
                <span className="text-[11px] text-[hsla(var(--muted-foreground),0.8)]">
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
                <span className="inline-flex h-2 w-2 rounded-full bg-[rgba(52,211,153,0.8)]" />
                <span>Wet Bulb</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex h-2 w-2 rounded-full bg-[rgba(148,163,184,0.7)]" />
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
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopySnapshotLink}
                  className="h-8 text-xs"
                >
                  {shareStatus === "copied"
                    ? "Link copied"
                    : shareStatus === "error"
                    ? "Clipboard blocked"
                    : "Copy share link"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                  className="h-8 text-xs"
                >
                  {isExportingPdf ? "Rendering…" : "Export PDF"}
                </Button>
              </div>
            </div>
          </motion.div>

          <div className="flex flex-1 min-h-0 flex-col overflow-hidden px-4 pb-4 pt-3 md:px-6 md:pb-6">
            <div
              ref={exportRef}
              className="flex h-full w-full flex-col rounded-2xl border border-[hsla(var(--border),0.6)] bg-[hsla(var(--background),0.4)] p-3 shadow-ambient"
            >
              <div className="flex h-full w-full overflow-hidden rounded-xl bg-[#000000]">
                <PsychroChart
                  unitSystem={unitSystem}
                  pressure={inputs.pressure}
                  selectedState={psychroState ?? undefined}
                  onSelectState={handleChartState}
                  zoomLocked={zoomLocked}
                  showHoverCrosshair={showHoverCrosshair}
                  statePoints={chartStatePoints}
                  processes={chartProcesses}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      <section
        id="templates"
        className="border-t border-[hsla(var(--border),0.6)] bg-background px-6 py-12 text-foreground"
        aria-labelledby="templates-heading"
      >
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Scenario presets
              </p>
              <h2 id="templates-heading" className="text-2xl font-semibold tracking-tight">
                Drop-in HVAC templates
              </h2>
              <p className="text-sm text-muted-foreground">
                Apply or overlay DOAS, data hall, and greenhouse loops to jumpstart your analysis.
              </p>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {SCENARIO_TEMPLATES.map((template) => (
              <article
                key={template.id}
                className={`rounded-2xl border px-4 py-4 text-sm shadow-sm backdrop-blur ${
                  activeTemplateId === template.id
                    ? "border-[rgba(52,211,153,0.8)] bg-[rgba(52,211,153,0.1)]"
                    : "border-[hsla(var(--border),0.6)] bg-[hsla(var(--card),0.4)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">{template.name}</h3>
                    <p className="text-xs text-muted-foreground">{template.summary}</p>
                  </div>
                  {activeTemplateId === template.id && (
                    <span className="text-[11px] font-semibold uppercase text-emerald-400">
                      Active
                    </span>
                  )}
                </div>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {template.insights.map((tip) => (
                    <li key={tip} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                  {template.points.map((point) => (
                    <span
                      key={point.label}
                      className="rounded-full border border-[hsla(var(--border),0.6)] px-2 py-0.5 text-muted-foreground"
                    >
                      {point.label}: {point.dryBulb}° / {point.relativeHumidity}%
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <Button size="sm" className="text-xs" onClick={() => handleApplyTemplate(template.id)}>
                    Apply template
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => handleOverlayTemplate(template.id)}
                  >
                    Overlay on chart
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-[hsla(var(--border),0.6)] bg-[hsla(var(--background),0.8)] px-6 py-4 text-xs text-muted-foreground">
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
