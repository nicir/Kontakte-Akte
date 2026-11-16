import { geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-50m.json";
import { Button } from "@/components/ui/button";
import type { CountryCount } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NO_DATA_COLOR, colorFor, type ScaleClass } from "./colorScale";

// Bundled offline: Natural Earth 1:50m via world-atlas (no tiles, no network).
const WIDTH = 960;
const HEIGHT = 500;

type CountryFeature = Feature<Geometry, { name: string }> & { id?: string };

const features: CountryFeature[] = (() => {
  const topology = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const collection = feature(topology, topology.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>;
  return (collection.features as CountryFeature[]).filter((f) => f.id !== "010"); // Antarctica adds only noise
})();

const projection = geoNaturalEarth1().fitExtent(
  [
    [8, 8],
    [WIDTH - 8, HEIGHT - 8],
  ],
  { type: "FeatureCollection", features } as FeatureCollection,
);
const pathGen = geoPath(projection);

const shapes = features.map((f) => ({
  numeric: f.id ? String(f.id).padStart(3, "0") : null,
  d: pathGen(f) ?? "",
  area: pathGen.area(f),
  centroid: pathGen.centroid(f),
}));

interface Transform {
  k: number;
  x: number;
  y: number;
}

const MIN_K = 1;
const MAX_K = 12;

export function WorldMap({
  counts,
  classes,
  selected,
  onSelect,
}: {
  counts: CountryCount[];
  classes: ScaleClass[];
  selected: string | null;
  onSelect: (code: string | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [t, setT] = useState<Transform>({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<{ country: CountryCount | null; name: string; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const byNumeric = useMemo(() => new Map(counts.filter((c) => c.numeric).map((c) => [c.numeric!, c])), [counts]);
  const nameByNumeric = useMemo(() => new Map(features.map((f) => [String(f.id ?? "").padStart(3, "0"), f.properties.name])), []);

  const clamp = (next: Transform): Transform => {
    const k = Math.min(MAX_K, Math.max(MIN_K, next.k));
    const minX = WIDTH - WIDTH * k;
    const minY = HEIGHT - HEIGHT * k;
    return { k, x: Math.min(0, Math.max(minX, next.x)), y: Math.min(0, Math.max(minY, next.y)) };
  };

  const toSvg = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * WIDTH, y: ((clientY - rect.top) / rect.height) * HEIGHT };
  };

  const zoomAt = (factor: number, px = WIDTH / 2, py = HEIGHT / 2) =>
    setT((cur) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, cur.k * factor));
      const ratio = k / cur.k;
      return clamp({ k, x: px - (px - cur.x) * ratio, y: py - (py - cur.y) * ratio });
    });

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    const p = toSvg(e.clientX, e.clientY);
    if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) zoomAt(Math.exp(-e.deltaY * 0.0025), p.x, p.y);
    else setT((cur) => clamp({ ...cur, x: cur.x - e.deltaX, y: cur.y - e.deltaY }));
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    if (drag.current && e.buttons === 1) {
      const dx = ((e.clientX - drag.current.x) / rect.width) * WIDTH;
      const dy = ((e.clientY - drag.current.y) / rect.height) * HEIGHT;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        drag.current = { x: e.clientX, y: e.clientY, moved: true };
        setT((cur) => clamp({ ...cur, x: cur.x + dx, y: cur.y + dy }));
        setHover(null);
      }
    }
  };
  const onPointerUp = () => {
    window.setTimeout(() => (drag.current = null), 0);
  };

  const handleClick = (code: string | null) => {
    if (drag.current?.moved) return;
    onSelect(code);
  };

  const showHover = (e: React.MouseEvent, numeric: string | null) => {
    if (drag.current?.moved || !numeric) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const country = byNumeric.get(numeric) ?? null;
    setHover({ country, name: country?.name ?? nameByNumeric.get(numeric) ?? "", x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // Countries with contacts but too small to see get a dot so they stay clickable.
  const markers = shapes.filter((s) => s.numeric && byNumeric.has(s.numeric) && s.area * t.k * t.k < 40);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label="Weltkarte mit Kontaktdichte je Land"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setHover(null);
          drag.current = null;
        }}
      >
        <rect width={WIDTH} height={HEIGHT} fill="transparent" onClick={() => handleClick(null)} />
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
          {shapes.map((s, i) => {
            const country = s.numeric ? byNumeric.get(s.numeric) : undefined;
            const isSelected = !!country && country.code === selected;
            return (
              <path
                key={i}
                d={s.d}
                fill={country ? colorFor(country.count, classes) : NO_DATA_COLOR}
                stroke={isSelected ? "#1F2937" : "#FFFFFF"}
                strokeWidth={(isSelected ? 1.6 : 0.5) / t.k}
                className={cn(country ? "cursor-pointer" : "cursor-default", "transition-[fill] duration-150 hover:brightness-95")}
                onMouseMove={(e) => showHover(e, s.numeric)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick(country?.code ?? null);
                }}
              />
            );
          })}
          {markers.map((s) => {
            const country = byNumeric.get(s.numeric!)!;
            return (
              <circle
                key={`m-${s.numeric}`}
                cx={s.centroid[0]}
                cy={s.centroid[1]}
                r={4.5 / t.k}
                fill={colorFor(country.count, classes)}
                stroke={country.code === selected ? "#1F2937" : "#FFFFFF"}
                strokeWidth={1.5 / t.k}
                className="cursor-pointer"
                onMouseMove={(e) => showHover(e, s.numeric)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick(country.code);
                }}
              />
            );
          })}
        </g>
      </svg>

      {hover && hover.name && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
          role="tooltip"
        >
          <div className="font-medium text-foreground">{hover.name}</div>
          <div className="text-muted-foreground">
            {hover.country ? `${hover.country.count} ${hover.country.count === 1 ? "Kontakt" : "Kontakte"}` : "Keine Kontakte"}
          </div>
        </div>
      )}

      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <Button variant="outline" size="icon" className="size-8 bg-card" onClick={() => zoomAt(1.6)} aria-label="Hineinzoomen">
          <Plus className="size-4" />
        </Button>
        <Button variant="outline" size="icon" className="size-8 bg-card" onClick={() => zoomAt(1 / 1.6)} aria-label="Herauszoomen">
          <Minus className="size-4" />
        </Button>
        <Button variant="outline" size="icon" className="size-8 bg-card" onClick={() => setT({ k: 1, x: 0, y: 0 })} aria-label="Ansicht zurücksetzen">
          <RotateCcw className="size-4" />
        </Button>
      </div>
    </div>
  );
}
