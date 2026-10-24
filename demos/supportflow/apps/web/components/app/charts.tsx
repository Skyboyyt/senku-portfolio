"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Series {
  key: string;
  name: string;
  /** CSS colour, normally var(--chart-1) / var(--chart-2). */
  color: string;
}

export interface Datum {
  label: string;
  /** Short axis label; defaults to label. */
  tick?: string;
  values: Record<string, number | null>;
}

const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 26, left: 40 };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** Clean axis ticks: 0 and up to 4 round steps covering the max. */
function niceTicks(max: number, integer = false): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  // Counts never get fractional ticks.
  if (integer) step = Math.max(1, Math.ceil(step));
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(6)));
  if (ticks.at(-1)! < max) ticks.push(ticks.at(-1)! + step);
  return ticks;
}

export function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Show at most ~8 x labels so they never collide. */
function tickEvery(count: number, width: number) {
  const fit = Math.max(2, Math.floor((width - PAD.left) / 64));
  return Math.max(1, Math.ceil(count / fit));
}

interface ChartProps {
  title: string;
  description?: ReactNode;
  data: Datum[];
  series: Series[];
  format?: (value: number) => string;
  /** Shown instead of the chart when every value is zero or missing. */
  emptyMessage?: string;
  className?: string;
}

function ChartFrame({
  title,
  description,
  series,
  data,
  format,
  children,
  isEmpty,
  emptyMessage,
  className,
}: ChartProps & { children: ReactNode; isEmpty: boolean }) {
  const [showTable, setShowTable] = useState(false);
  const fmt = format ?? ((v: number) => v.toLocaleString("en-US"));
  return (
    <figure className={cn("rounded-lg border border-border bg-surface", className)}>
      <figcaption className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-text">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            className="min-h-9 shrink-0 rounded-md px-2 text-[13px] text-muted underline-offset-4 hover:text-text hover:underline"
          >
            {showTable ? "Show chart" : "Show table"}
          </button>
        )}
      </figcaption>
      <div className="px-4 pb-4 pt-3 sm:px-5">
        {series.length > 1 && !isEmpty && (
          <ul className="mb-2 flex flex-wrap gap-4 text-[13px] text-muted" aria-label="Legend">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
                {s.name}
              </li>
            ))}
          </ul>
        )}
        {isEmpty ? (
          <p className="grid h-[200px] place-items-center text-center text-sm text-muted">{emptyMessage ?? "No data in this period yet."}</p>
        ) : showTable ? (
          <div className="max-h-[260px] overflow-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="sticky top-0 bg-surface text-muted">
                <tr>
                  <th scope="col" className="py-1.5 pr-4 font-medium">Date</th>
                  {series.map((s) => (
                    <th key={s.key} scope="col" className="py-1.5 pr-4 text-right font-medium">{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.label} className="border-t border-border">
                    <th scope="row" className="py-1.5 pr-4 font-normal text-muted">{d.label}</th>
                    {series.map((s) => {
                      const v = d.values[s.key];
                      return (
                        <td key={s.key} className="py-1.5 pr-4 text-right text-text">{v === null || v === undefined ? "—" : fmt(v)}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </figure>
  );
}

function Tooltip({ x, width, datum, series, format }: { x: number; width: number; datum: Datum; series: Series[]; format: (v: number) => string }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md"
      style={{ left }}
    >
      <p className="font-medium text-text">{datum.label}</p>
      {series.map((s) => {
        const v = datum.values[s.key];
        return (
          <p key={s.key} className="mt-0.5 flex items-center gap-1.5 text-muted">
            <span aria-hidden className="size-2 rounded-sm" style={{ background: s.color }} />
            {s.name}: <span className="font-medium text-text tabular-nums">{v === null || v === undefined ? "—" : format(v)}</span>
          </p>
        );
      })}
    </div>
  );
}

function Axes({ width, ticks, y, data, every }: { width: number; ticks: number[]; y: (v: number) => number; data: Datum[]; every: number; }) {
  const plotW = width - PAD.left - PAD.right;
  const step = plotW / data.length;
  return (
    <g aria-hidden className="text-[11px]" fill="var(--text-subtle)">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" style={{ fontVariantNumeric: "tabular-nums" }}>
            {compact(t)}
          </text>
        </g>
      ))}
      {data.map((d, i) =>
        i % every === 0 ? (
          <text key={d.label} x={PAD.left + step * i + step / 2} y={HEIGHT - 6} textAnchor="middle">
            {d.tick ?? d.label}
          </text>
        ) : null,
      )}
    </g>
  );
}

/** Columns from a single baseline; grouped when there are two series. */
export function ColumnChart(props: ChartProps) {
  const { data, series } = props;
  const format = props.format ?? ((v: number) => v.toLocaleString("en-US"));
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  const max = Math.max(0, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)));
  const isEmpty = max === 0;
  const integer = data.every((d) => series.every((s) => Number.isInteger(d.values[s.key] ?? 0)));
  const ticks = niceTicks(max, integer);
  const top = ticks.at(-1)!;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const plotW = width - PAD.left - PAD.right;
  const band = plotW / Math.max(1, data.length);
  const gap = 2;
  const barW = Math.min(24, Math.max(2, (band * 0.7 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);

  return (
    <ChartFrame {...props} isEmpty={isEmpty}>
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-labelledby={titleId} className="block overflow-visible">
          <title id={titleId}>{`${props.title}: ${data.length} periods. Use "Show table" for exact values.`}</title>
          <Axes width={width} ticks={ticks} y={y} data={data} every={tickEvery(data.length, width)} />
          {data.map((d, i) => {
            const x0 = PAD.left + band * i + (band - groupW) / 2;
            return (
              <g key={d.label}>
                {hover === i && <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="var(--surface-2)" />}
                {series.map((s, si) => {
                  const v = d.values[s.key] ?? 0;
                  if (v <= 0) return null;
                  const h = Math.max(1, (v / top) * plotH);
                  const x = x0 + si * (barW + gap);
                  const r = Math.min(4, barW / 2, h);
                  const base = PAD.top + plotH;
                  // Rounded data-end, square at the baseline.
                  const path = `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + barW - r} Q${x + barW},${base - h} ${x + barW},${base - h + r} V${base} Z`;
                  return <path key={s.key} d={path} fill={s.color} />;
                })}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            );
          })}
          <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeWidth={1} />
        </svg>
        {hover !== null && data[hover] && (
          <Tooltip x={PAD.left + band * hover + band / 2} width={width} datum={data[hover]} series={series} format={format} />
        )}
      </div>
    </ChartFrame>
  );
}

/** A single-series line with gaps where a value is missing, and a crosshair tooltip. */
export function LineChart(props: ChartProps) {
  const { data, series } = props;
  const s = series[0]!;
  const format = props.format ?? ((v: number) => v.toLocaleString("en-US"));
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  const values = data.map((d) => d.values[s.key]);
  const present = values.filter((v): v is number => v !== null && v !== undefined);
  const isEmpty = present.length === 0;
  const ticks = niceTicks(Math.max(0, ...present));
  const top = ticks.at(-1)!;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const plotW = width - PAD.left - PAD.right;
  const band = plotW / Math.max(1, data.length);
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  // Break the path at missing values instead of drawing through them.
  const segments: string[] = [];
  let current = "";
  values.forEach((v, i) => {
    if (v === null || v === undefined) {
      if (current) segments.push(current);
      current = "";
    } else current += `${current ? "L" : "M"}${x(i)},${y(v)} `;
  });
  if (current) segments.push(current);
  const lastIndex = values.findLastIndex((v) => v !== null && v !== undefined);

  return (
    <ChartFrame {...props} isEmpty={isEmpty}>
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-labelledby={titleId} className="block overflow-visible">
          <title id={titleId}>{`${props.title}. Use "Show table" for exact values.`}</title>
          <Axes width={width} ticks={ticks} y={y} data={data} every={tickEvery(data.length, width)} />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--border-strong)" strokeWidth={1} />}
          {segments.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {values.map((v, i) =>
            v !== null && v !== undefined && (i === hover || i === lastIndex || isIsolated(values, i)) ? (
              <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ) : null,
          )}
          {data.map((d, i) => (
            <rect key={d.label} x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hover !== null && data[hover] && <Tooltip x={x(hover)} width={width} datum={data[hover]} series={series} format={format} />}
      </div>
    </ChartFrame>
  );
}

const missing = (v: number | null | undefined) => v === null || v === undefined;
/** A point with no neighbours draws no line, so it needs a dot to be visible. */
function isIsolated(values: (number | null | undefined)[], i: number) {
  return missing(values[i - 1]) && missing(values[i + 1]);
}

/** Usage against a limit. The fill turns to warning at 80% and danger at 100%. */
export function Meter({ label, value, max, hint }: { label: string; value: number; max: number; hint?: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const tone = ratio >= 1 ? "var(--danger)" : ratio >= 0.8 ? "var(--warning)" : "var(--primary)";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-text">
          <span className="font-semibold">{value.toLocaleString("en-US")}</span>
          <span className="text-subtle"> / {max.toLocaleString("en-US")}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"
      >
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${ratio * 100}%`, background: tone }} />
      </div>
      {hint && <p className="mt-1.5 text-xs text-subtle">{hint}</p>}
    </div>
  );
}

/** A row of figures separated by hairlines — one panel instead of a grid of cards. */
export function StatStrip({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {items.map((item) => (
        // Overlapping hairlines: each cell draws right/bottom borders; the frame hides the outer ones.
        <div key={item.label} className="-mb-px -mr-px border-b border-r border-border px-4 py-4">
          <dt className="text-[13px] text-muted">{item.label}</dt>
          <dd className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-text">{item.value}</dd>
          {item.hint && <dd className="mt-0.5 text-xs text-subtle">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
