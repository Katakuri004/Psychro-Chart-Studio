"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { motion } from "framer-motion";
import { area, curveCatmullRom, line } from "d3-shape";
import { scaleLinear } from "d3-scale";
import { format } from "d3-format";
import {
  zoom,
  zoomIdentity,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3-zoom";
import { select, type Selection } from "d3-selection";
import "d3-transition";

import {
  computePsychrometricsFromHumRatio,
  generateEnthalpyLines,
  generateRelativeHumidityCurves,
  generateSaturationCurve,
  generateSpecificVolumeLines,
  generateWetBulbLines,
  getChartExtents,
  humidityRatioFromDisplay,
  humidityRatioToDisplay,
  type PsychroState,
  type UnitSystem,
} from "@/lib/psychrometrics";

const MARGINS = { top: 32, right: 36, bottom: 68, left: 88 } as const;

export interface PsychroChartProps {
  unitSystem: UnitSystem;
  pressure: number;
  selectedState?: PsychroState | null;
  onSelectState?: (state: PsychroState) => void;
  zoomLocked?: boolean;
  showHoverCrosshair?: boolean;
}

const useContainerSize = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
};

const formatTemperatureSI = format(".0f");
const formatTemperatureIP = format(".0f");
const formatHumiditySI = format(".1f");
const formatHumidityIP = format(".0f");

export function PsychroChart({
  unitSystem,
  pressure,
  selectedState,
  onSelectState,
  zoomLocked = false,
  showHoverCrosshair = true,
}: PsychroChartProps) {
  const { ref: containerRef, width, height } = useContainerSize();
  const svgRef = useRef<SVGSVGElement>(null);
  const interactionRef = useRef<SVGRectElement>(null);
  const zoomBehaviorRef =
    useRef<ZoomBehavior<SVGRectElement, unknown> | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const zoomLevel = transform?.k ?? 1;
  /**
   * Hover crosshair state is throttled via requestAnimationFrame to avoid
   * excessive renders while still responding quickly to pointer movement.
   */
  const [hoverMarker, setHoverMarker] = useState<{
    cx: number;
    cy: number;
    dryBulb: number;
    humidityDisplay: number;
  } | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const pendingHoverRef = useRef<{
    cx: number;
    cy: number;
    dryBulb: number;
    humidityDisplay: number;
  } | null>(null);

  const hasSize = width > 0 && height > 0;
  const innerWidth = Math.max(width - (MARGINS.left + MARGINS.right), 40);
  const innerHeight = Math.max(height - (MARGINS.top + MARGINS.bottom), 40);

  const extents = useMemo(() => getChartExtents(unitSystem), [unitSystem]);
  const saturationCurve = useMemo(
    () => generateSaturationCurve(unitSystem, pressure, extents.dryBulb),
    [unitSystem, pressure, extents.dryBulb]
  );
  const relativeHumidityLevels = useMemo(() => {
    const base = [
      0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.98,
    ];
    const set = new Set(base);
    if (zoomLevel > 1.8) {
      for (let v = 0.05; v < 0.95; v += 0.1) set.add(Number(v.toFixed(2)));
    }
    if (zoomLevel > 3.5) {
      for (let v = 0.02; v < 0.98; v += 0.04) set.add(Number(v.toFixed(2)));
    }
    if (zoomLevel > 5) {
      for (let v = 0.01; v < 0.99; v += 0.02) set.add(Number(v.toFixed(2)));
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [zoomLevel]);

  const humidityCurveStep =
    unitSystem === "si"
      ? zoomLevel > 5
        ? 0.15
        : zoomLevel > 3.5
        ? 0.3
        : 0.5
      : zoomLevel > 5
      ? 0.3
      : zoomLevel > 3.5
      ? 0.6
      : 1;

  const relativeHumidityCurves = useMemo(
    () =>
      generateRelativeHumidityCurves(
        unitSystem,
        pressure,
        extents.dryBulb,
        relativeHumidityLevels,
        humidityCurveStep
      ),
    [
      unitSystem,
      pressure,
      extents.dryBulb,
      relativeHumidityLevels,
      humidityCurveStep,
    ]
  );

  const enthalpyValues = useMemo(() => {
    const base =
      unitSystem === "si"
        ? [0, 10, 20, 30, 40, 50, 60, 80, 100, 120]
        : [0, 10, 20, 30, 40, 50];
    const set = new Set(base);
    if (zoomLevel > 1.8) {
      base.forEach((val) => {
        set.add(val + (unitSystem === "si" ? 5 : 5));
      });
    }
    if (zoomLevel > 3.5) {
      base.forEach((val) => {
        set.add(val + (unitSystem === "si" ? 2.5 : 2.5));
      });
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [unitSystem, zoomLevel]);

  const enthalpyStep = zoomLevel > 4 ? 0.002 : zoomLevel > 2 ? 0.004 : 0.006;

  const enthalpyLines = useMemo(
    () =>
      generateEnthalpyLines(
        unitSystem,
        pressure,
        extents.dryBulb,
        enthalpyValues,
        enthalpyStep
      ),
    [unitSystem, pressure, extents.dryBulb, enthalpyValues, enthalpyStep]
  );

  const wetBulbValues = useMemo(() => {
    const base =
      unitSystem === "si"
        ? [-10, -5, 0, 5, 10, 15, 20, 25, 30]
        : [10, 20, 30, 40, 50, 60, 70];
    const set = new Set(base);
    if (zoomLevel > 1.8) {
      base.forEach((v) => set.add(v + (unitSystem === "si" ? 2.5 : 5)));
    }
    if (zoomLevel > 3.5) {
      base.forEach((v) => set.add(v + (unitSystem === "si" ? 1.25 : 2.5)));
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [unitSystem, zoomLevel]);

  const wetBulbStep =
    unitSystem === "si"
      ? zoomLevel > 4
        ? 0.4
        : zoomLevel > 2
        ? 0.6
        : 0.8
      : zoomLevel > 4
      ? 0.8
      : zoomLevel > 2
      ? 1.2
      : 1.6;

  const wetBulbLines = useMemo(
    () =>
      generateWetBulbLines(
        unitSystem,
        pressure,
        extents.dryBulb,
        wetBulbValues,
        wetBulbStep
      ),
    [
      unitSystem,
      pressure,
      extents.dryBulb,
      wetBulbValues,
      wetBulbStep,
    ]
  );

  const specificVolumeValues = useMemo(() => {
    const base =
      unitSystem === "si"
        ? [0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1]
        : [12.5, 13, 13.5, 14, 14.5, 15];
    const set = new Set(base);
    if (zoomLevel > 1.8) {
      base.forEach((val) =>
        set.add(Number((val + (unitSystem === "si" ? 0.025 : 0.2)).toFixed(3)))
      );
    }
    if (zoomLevel > 3.5) {
      base.forEach((val) =>
        set.add(Number((val + (unitSystem === "si" ? 0.012 : 0.1)).toFixed(3)))
      );
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [unitSystem, zoomLevel]);

  const specificVolumeLines = useMemo(
    () =>
      generateSpecificVolumeLines(
        unitSystem,
        pressure,
        extents.dryBulb,
        specificVolumeValues,
        unitSystem === "si"
          ? zoomLevel > 4
            ? 0.4
            : 0.6
          : zoomLevel > 4
          ? 0.6
          : 1
      ),
    [
      unitSystem,
      pressure,
      extents.dryBulb,
      specificVolumeValues,
      zoomLevel,
    ]
  );

  const humidityDomainDisplay = useMemo(
    () => [
      humidityRatioToDisplay(unitSystem, extents.humidityRatio[0]),
      humidityRatioToDisplay(unitSystem, extents.humidityRatio[1]),
    ],
    [unitSystem, extents.humidityRatio]
  );

  const temperatureFormatter =
    unitSystem === "si" ? formatTemperatureSI : formatTemperatureIP;
  const humidityFormatter =
    unitSystem === "si" ? formatHumiditySI : formatHumidityIP;

  const xBaseScale = useMemo(() => {
    return scaleLinear()
      .domain(extents.dryBulb)
      .range([0, innerWidth]);
  }, [extents.dryBulb, innerWidth]);

  const yBaseScale = useMemo(() => {
    return scaleLinear()
      .domain(humidityDomainDisplay)
      .range([innerHeight, 0]);
  }, [humidityDomainDisplay, innerHeight]);

  const xScale = useMemo(() => {
    const base = xBaseScale.copy();
    return transform ? transform.rescaleX(base) : base;
  }, [xBaseScale, transform]);

  const yScale = useMemo(() => {
    const base = yBaseScale.copy();
    return transform ? transform.rescaleY(base) : base;
  }, [yBaseScale, transform]);

  useEffect(() => {
    if (!interactionRef.current || !hasSize) {
      return;
    }

    const selection: Selection<SVGRectElement, unknown, null, undefined> =
      select(interactionRef.current);
    selection.on(".zoom", null);

    if (zoomLocked) {
      zoomBehaviorRef.current = null;
      return;
    }

    const zoomBehavior = zoom<SVGRectElement, unknown>()
      .scaleExtent([1, 12])
      .translateExtent([
        [0, 0],
        [innerWidth, innerHeight],
      ])
      .extent([
        [0, 0],
        [innerWidth, innerHeight],
      ])
      .on("zoom", (event) => {
        setTransform(event.transform);
      });

    zoomBehaviorRef.current = zoomBehavior;
    selection.call(zoomBehavior);
    selection.on("dblclick.zoom", null);

    return () => {
      selection.on(".zoom", null);
    };
  }, [hasSize, innerHeight, innerWidth, zoomLocked]);

  useEffect(() => {
    if (!showHoverCrosshair) {
      if (hoverFrameRef.current !== null) {
        cancelAnimationFrame(hoverFrameRef.current);
        hoverFrameRef.current = null;
      }
      pendingHoverRef.current = null;
      startTransition(() => setHoverMarker(null));
    }
  }, [showHoverCrosshair]);

  useEffect(() => {
    return () => {
      if (hoverFrameRef.current !== null) {
        cancelAnimationFrame(hoverFrameRef.current);
        hoverFrameRef.current = null;
      }
      pendingHoverRef.current = null;
    };
  }, []);

  const handleDoubleClick = () => {
    setTransform(zoomIdentity);
    if (interactionRef.current && zoomBehaviorRef.current) {
      select(interactionRef.current)
        .transition()
        .duration(240)
        .call(zoomBehaviorRef.current.transform, zoomIdentity);
    }
  };

  const resolvePointerPosition = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width);
      const y = Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height);
      return { x, y };
    },
    []
  );

  const handlePointerUp = (event: ReactPointerEvent<SVGRectElement>) => {
    if (!onSelectState) return;
    const { x, y } = resolvePointerPosition(event);
    const dryBulb = xScale.invert(x);
    const humidityDisplay = yScale.invert(y);

    const clampedDryBulb = Math.min(
      Math.max(dryBulb, extents.dryBulb[0]),
      extents.dryBulb[1]
    );
    const clampedHumidityDisplay = Math.min(
      Math.max(humidityDisplay, humidityDomainDisplay[0]),
      humidityDomainDisplay[1]
    );

    try {
      const humidityRatio = humidityRatioFromDisplay(
        unitSystem,
        clampedHumidityDisplay
      );

      if (!Number.isFinite(humidityRatio)) {
        return;
      }

      const state = computePsychrometricsFromHumRatio(
        {
          dryBulb: clampedDryBulb,
          humidityRatio,
          pressure,
        },
        unitSystem
      );

      if (state) {
        const markerPayload = {
          cx: xScale(clampedDryBulb),
          cy: yScale(clampedHumidityDisplay),
          dryBulb: clampedDryBulb,
          humidityDisplay: clampedHumidityDisplay,
        };
        startTransition(() => setHoverMarker(markerPayload));
        onSelectState(state);
      }
    } catch (error) {
      console.error("Failed to resolve psychrometric state", error);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGRectElement>) => {
    if (!showHoverCrosshair) {
      if (hoverMarker) {
        startTransition(() => setHoverMarker(null));
      }
      return;
    }
    const { x, y } = resolvePointerPosition(event);
    const dryBulb = xScale.invert(x);
    const humidityDisplay = yScale.invert(y);
    const clampedDryBulb = Math.min(
      Math.max(dryBulb, extents.dryBulb[0]),
      extents.dryBulb[1]
    );
    const clampedHumidityDisplay = Math.min(
      Math.max(humidityDisplay, humidityDomainDisplay[0]),
      humidityDomainDisplay[1]
    );
    const nextMarker = {
      cx: xScale(clampedDryBulb),
      cy: yScale(clampedHumidityDisplay),
      dryBulb: clampedDryBulb,
      humidityDisplay: clampedHumidityDisplay,
    };

    pendingHoverRef.current = nextMarker;

    const commit = () => {
      hoverFrameRef.current = null;
      if (!showHoverCrosshair) {
        return;
      }
      const payload = pendingHoverRef.current;
      if (!payload) return;

      const isUnchanged =
        hoverMarker &&
        Math.abs(hoverMarker.cx - payload.cx) < 0.1 &&
        Math.abs(hoverMarker.cy - payload.cy) < 0.1;

      if (!isUnchanged) {
        startTransition(() => setHoverMarker(payload));
      }
    };

    if (hoverFrameRef.current !== null) {
      cancelAnimationFrame(hoverFrameRef.current);
    }
    hoverFrameRef.current = requestAnimationFrame(commit);
  };

  const handlePointerLeave = () => {
    startTransition(() => setHoverMarker(null));
    pendingHoverRef.current = null;
    if (hoverFrameRef.current !== null) {
      cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = null;
    }
  };

  const humidityLineGenerator = useMemo(
    () =>
      line<{ dryBulb: number; humidityRatio: number }>()
        .x((d) => xScale(d.dryBulb))
        .y((d) => yScale(humidityRatioToDisplay(unitSystem, d.humidityRatio)))
        .curve(curveCatmullRom.alpha(0.5)),
    [unitSystem, xScale, yScale]
  );

  const enthalpyLineGenerator = useMemo(
    () =>
      line<{ dryBulb: number; humidityRatio: number }>()
        .x((d) => xScale(d.dryBulb))
        .y((d) => yScale(humidityRatioToDisplay(unitSystem, d.humidityRatio)))
        .curve(curveCatmullRom.alpha(0.3)),
    [unitSystem, xScale, yScale]
  );

  const saturationAreaPath = useMemo(() => {
    if (!hasSize) return null;
    const generator = area<{ dryBulb: number; humidityRatio: number }>()
      .x((d) => xScale(d.dryBulb))
      .y0(() => yScale(humidityDomainDisplay[0]))
      .y1((d) => yScale(humidityRatioToDisplay(unitSystem, d.humidityRatio)))
      .curve(curveCatmullRom.alpha(0.6));
    return generator(saturationCurve.points);
  }, [
    hasSize,
    humidityDomainDisplay,
    saturationCurve.points,
    unitSystem,
    xScale,
    yScale,
  ]);

  const saturationLinePath = useMemo(() => {
    if (!hasSize) return null;
    return humidityLineGenerator(saturationCurve.points);
  }, [hasSize, humidityLineGenerator, saturationCurve.points]);

  const relativeHumidityPaths = useMemo(() => {
    if (!hasSize) return [];
    return relativeHumidityCurves.map((curve) => ({
      id: curve.id,
      label: curve.label,
      path: humidityLineGenerator(
        curve.points.filter(
          (point) => point.humidityRatio <= extents.humidityRatio[1]
        )
      ),
      level: curve.level,
    }));
  }, [
    hasSize,
    relativeHumidityCurves,
    humidityLineGenerator,
    extents.humidityRatio,
  ]);

  const enthalpyPaths = useMemo(() => {
    if (!hasSize) return [];
    return enthalpyLines.map((curve) => ({
      id: curve.id,
      label: curve.label,
      path: enthalpyLineGenerator(
        curve.points.filter(
          (point) => point.humidityRatio <= extents.humidityRatio[1]
        )
      ),
      level: curve.level,
    }));
  }, [
    hasSize,
    enthalpyLines,
    enthalpyLineGenerator,
    extents.humidityRatio,
  ]);

  const wetBulbPaths = useMemo(() => {
    if (!hasSize) return [];
    return wetBulbLines.map((curve) => ({
      id: curve.id,
      label: curve.label,
      points: curve.points,
      path: humidityLineGenerator(
        curve.points.filter(
          (point) => point.humidityRatio <= extents.humidityRatio[1]
        )
      ),
    }));
  }, [hasSize, wetBulbLines, humidityLineGenerator, extents.humidityRatio]);

  const specificVolumePaths = useMemo(() => {
    if (!hasSize) return [];
    return specificVolumeLines.map((curve) => ({
      id: curve.id,
      label: curve.label,
      path: humidityLineGenerator(
        curve.points.filter(
          (point) => point.humidityRatio <= extents.humidityRatio[1]
        )
      ),
    }));
  }, [
    hasSize,
    specificVolumeLines,
    humidityLineGenerator,
    extents.humidityRatio,
  ]);

  const xTicks = useMemo(() => xScale.ticks(10), [xScale]);
  const yTicks = useMemo(() => yScale.ticks(8), [yScale]);

  const markerPosition = useMemo(() => {
    if (!selectedState) return null;
    return {
      cx: xScale(selectedState.dryBulb),
      cy: yScale(
        humidityRatioToDisplay(unitSystem, selectedState.humidityRatio)
      ),
    };
  }, [selectedState, unitSystem, xScale, yScale]);

  const humidityAxisLabel =
    unitSystem === "si"
      ? "Humidity Ratio (g/kg dry air)"
      : "Humidity Ratio (gr/lb dry air)";
  const temperatureAxisLabel =
    unitSystem === "si"
      ? "Dry Bulb Temperature (°C)"
      : "Dry Bulb Temperature (°F)";

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-2xl bg-[#000000]"
    >
      {hasSize ? (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="pointer-events-none select-none"
        >
          <defs>
            <clipPath id="chart-clip">
              <rect width={innerWidth} height={innerHeight} x={0} y={0} />
            </clipPath>
            <linearGradient id="saturation-fill" x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0%"
                stopColor="rgb(192, 132, 252)"
                stopOpacity={0.24}
              />
              <stop
                offset="100%"
                stopColor="rgb(192, 132, 252)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <g transform={`translate(${MARGINS.left},${MARGINS.top})`}>
            <g className="stroke-border/30" clipPath="url(#chart-clip)">
              {xTicks.map((tick) => (
                <line
                  key={`grid-x-${tick}`}
                  x1={xScale(tick)}
                  x2={xScale(tick)}
                  y1={0}
                  y2={innerHeight}
                  strokeWidth={tick % 10 === 0 ? 1 : 0.6}
                  stroke="rgba(148, 163, 184, 0.2)"
                />
              ))}
              {yTicks.map((tick) => (
                <line
                  key={`grid-y-${tick}`}
                  x1={0}
                  x2={innerWidth}
                  y1={yScale(tick)}
                  y2={yScale(tick)}
                  strokeWidth={0.6}
                  stroke="rgba(148, 163, 184, 0.16)"
                />
              ))}
            </g>

            {saturationAreaPath && (
              <path
                d={saturationAreaPath}
                fill="url(#saturation-fill)"
                stroke="none"
                clipPath="url(#chart-clip)"
              />
            )}
            {saturationLinePath && (
              <path
                d={saturationLinePath}
                fill="none"
                stroke="rgb(192, 132, 252)"
                strokeWidth={2.2}
                strokeOpacity={0.95}
                clipPath="url(#chart-clip)"
              />
            )}

            {relativeHumidityPaths.map((curve) =>
              curve.path ? (
                <path
                  key={curve.id}
                  d={curve.path}
                  fill="none"
                  stroke="rgba(96, 165, 250, 0.85)"
                  strokeWidth={curve.level === 0.5 ? 1.6 : 1}
                  strokeOpacity={curve.level === 0.5 ? 0.85 : 0.55}
                  clipPath="url(#chart-clip)"
                />
              ) : null
            )}

            {wetBulbPaths.map((curve) =>
              curve.path ? (
                <path
                  key={curve.id}
                  d={curve.path}
                  fill="none"
                  stroke="rgba(34, 197, 94, 0.5)"
                  strokeWidth={1}
                  strokeOpacity={0.6}
                  strokeDasharray="4 4"
                  clipPath="url(#chart-clip)"
                />
              ) : null
            )}

            {enthalpyPaths.map((curve) =>
              curve.path ? (
                <path
                  key={curve.id}
                  d={curve.path}
                  fill="none"
                  stroke="rgba(251, 191, 36, 0.6)"
                  strokeWidth={0.8}
                  strokeOpacity={0.65}
                  strokeDasharray="6 4"
                  clipPath="url(#chart-clip)"
                />
              ) : null
            )}

            {specificVolumePaths.map((curve) =>
              curve.path ? (
                <path
                  key={curve.id}
                  d={curve.path}
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.35)"
                  strokeWidth={0.9}
                  strokeDasharray="2 6"
                  clipPath="url(#chart-clip)"
                />
              ) : null
            )}

            {markerPosition && (
              <g className="pointer-events-none">
                <line
                  x1={markerPosition.cx}
                  x2={markerPosition.cx}
                  y1={0}
                  y2={innerHeight}
                  stroke="rgba(56, 189, 248, 0.85)"
                  strokeDasharray="2 4"
                  strokeOpacity={0.6}
                />
                <line
                  x1={0}
                  x2={innerWidth}
                  y1={markerPosition.cy}
                  y2={markerPosition.cy}
                  stroke="rgba(56, 189, 248, 0.85)"
                  strokeDasharray="2 4"
                  strokeOpacity={0.6}
                />
                <motion.circle
                  cx={markerPosition.cx}
                  cy={markerPosition.cy}
                  r={7}
                  fill="rgba(56, 189, 248, 1)"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 0.95 }}
                  transition={{ type: "spring", stiffness: 240, damping: 18 }}
                />
              </g>
            )}

            {showHoverCrosshair && hoverMarker && (
              <g className="pointer-events-none">
                <line
                  x1={hoverMarker.cx}
                  x2={hoverMarker.cx}
                  y1={0}
                  y2={innerHeight}
                  stroke="rgba(255, 255, 255, 0.3)"
                  strokeDasharray="3 5"
                />
                <line
                  x1={0}
                  x2={innerWidth}
                  y1={hoverMarker.cy}
                  y2={hoverMarker.cy}
                  stroke="rgba(255, 255, 255, 0.3)"
                  strokeDasharray="3 5"
                />
                <text
                  x={hoverMarker.cx}
                  y={innerHeight + 28}
                  fill="#ffffff"
                  fontSize={11}
                  textAnchor="middle"
                >
                  {`${temperatureFormatter(hoverMarker.dryBulb)} ${
                    unitSystem === "si" ? "°C" : "°F"
                  }`}
                </text>
                <text
                  x={-44}
                  y={hoverMarker.cy + 4}
                  fill="#ffffff"
                  fontSize={11}
                  textAnchor="end"
                >
                  {`${humidityFormatter(hoverMarker.humidityDisplay)} ${
                    unitSystem === "si" ? "g/kg" : "gr/lb"
                  }`}
                </text>
              </g>
            )}

            <line
              x1={0}
              y1={innerHeight}
              x2={innerWidth}
              y2={innerHeight}
              stroke="rgba(148, 163, 184, 0.3)"
              strokeWidth={1.1}
            />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={innerHeight}
              stroke="rgba(148, 163, 184, 0.3)"
              strokeWidth={1.1}
            />

            <g className="text-xs font-medium">
              {xTicks.map((tick) => (
                <text
                  key={`tick-x-${tick}`}
                  x={xScale(tick)}
                  y={innerHeight + 16}
                  textAnchor="middle"
                  fill="#ffffff"
                >
                  {temperatureFormatter(tick)}
                </text>
              ))}
              {yTicks.map((tick) => (
                <text
                  key={`tick-y-${tick}`}
                  x={-12}
                  y={yScale(tick) + 4}
                  textAnchor="end"
                  fill="#ffffff"
                >
                  {humidityFormatter(tick)}
                </text>
              ))}
            </g>

            <text
              x={innerWidth / 2}
              y={innerHeight + 44}
              textAnchor="middle"
              className="text-sm font-medium"
              fill="#ffffff"
            >
              {temperatureAxisLabel}
            </text>

            <text
              transform={`translate(${-58},${innerHeight / 2}) rotate(-90)`}
              textAnchor="middle"
              className="text-sm font-medium"
              fill="#ffffff"
            >
              {humidityAxisLabel}
            </text>

            <rect
              ref={interactionRef}
              x={0}
              y={0}
              width={innerWidth}
              height={innerHeight}
              fill="transparent"
              className="pointer-events-auto cursor-crosshair"
              onDoubleClick={handleDoubleClick}
              onPointerUp={handlePointerUp}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
            />
          </g>
        </svg>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <motion.div
            className="flex flex-col items-center gap-2 text-muted-foreground"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-sm font-medium tracking-wide">
              Initializing psychrometric canvas…
            </span>
            <span className="text-xs text-muted-foreground/70">
              Resize-aware chart boots immediately after hydration.
            </span>
          </motion.div>
        </div>
      )}
      {zoomLocked && (
        <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-ambient backdrop-blur">
          Zoom locked
        </div>
      )}
    </div>
  );
}

