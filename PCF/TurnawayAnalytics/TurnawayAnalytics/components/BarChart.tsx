import * as React from "react";
import { ChartGroup } from "./types";
import { niceCeil } from "./aggregate";

export interface BarChartProps {
  groups: ChartGroup[];
  colorFor: (key: string) => string;
  width: number;
  height: number;
  /** Draw the numeric value on top of each bar (used in single-month view). */
  showValues?: boolean;
}

interface HoverInfo {
  x: number;
  y: number;
  label: string;
  key: string;
  value: number;
}

const M = { top: 16, right: 12, bottom: 64, left: 44 };

export const BarChart: React.FC<BarChartProps> = ({ groups, colorFor, width, height, showValues }) => {
  const [hover, setHover] = React.useState<HoverInfo | null>(null);

  const w = Math.max(width, 240);
  const h = Math.max(height, 200);
  const plotW = w - M.left - M.right;
  const plotH = h - M.top - M.bottom;

  const maxVal = React.useMemo(() => {
    let m = 0;
    for (const g of groups) for (const b of g.bars) if (b.value > m) m = b.value;
    return m;
  }, [groups]);
  const yMax = niceCeil(maxVal);

  const n = groups.length || 1;
  const groupW = plotW / n;
  const groupPad = Math.min(groupW * 0.18, 14);
  const innerW = groupW - groupPad * 2;
  const barsPer = Math.max(groups[0]?.bars.length ?? 1, 1);
  const barGap = barsPer > 1 ? Math.min(innerW * 0.06, 4) : 0;
  const barW = Math.max((innerW - barGap * (barsPer - 1)) / barsPer, 1);

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (yMax / yTicks) * i);
  const y = (v: number) => M.top + plotH - (v / (yMax || 1)) * plotH;

  const rotate = n > 6 || barsPer * n > 14;

  return (
    <div className="ta-chartwrap" style={{ position: "relative", width: "100%" }}>
      <svg
        className="ta-svg"
        width={w}
        height={h}
        role="img"
        onMouseLeave={() => setHover(null)}
      >
        {/* y grid + labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={M.left} x2={w - M.right} y1={y(t)} y2={y(t)} className="ta-grid" />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" className="ta-axis-text">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {/* x axis baseline */}
        <line x1={M.left} x2={w - M.right} y1={y(0)} y2={y(0)} className="ta-axis-line" />

        {groups.map((g, gi) => {
          const gx = M.left + gi * groupW + groupPad;
          return (
            <g key={g.label}>
              {g.bars.map((b, bi) => {
                const bx = gx + bi * (barW + barGap);
                const bh = Math.max((b.value / (yMax || 1)) * plotH, b.value > 0 ? 2 : 0);
                const by = M.top + plotH - bh;
                const hov = (e: React.MouseEvent) =>
                  setHover({
                    x: e.nativeEvent.offsetX,
                    y: e.nativeEvent.offsetY,
                    label: g.label,
                    key: b.key,
                    value: b.value,
                  });
                return (
                  <g key={b.key + bi}>
                    <rect
                      x={bx}
                      y={by}
                      width={barW}
                      height={bh}
                      rx={Math.min(barW / 4, 3)}
                      fill={colorFor(b.key)}
                      className="ta-bar"
                      onMouseMove={hov}
                      onMouseEnter={hov}
                    />
                    {showValues && b.value > 0 && (
                      <text
                        x={bx + barW / 2}
                        y={Math.max(by - 5, M.top + 9)}
                        textAnchor="middle"
                        className="ta-barlabel"
                      >
                        {b.value}
                      </text>
                    )}
                  </g>
                );
              })}
              <text
                x={M.left + gi * groupW + groupW / 2}
                y={h - M.bottom + (rotate ? 14 : 18)}
                textAnchor={rotate ? "end" : "middle"}
                className="ta-axis-text ta-xlabel"
                transform={
                  rotate
                    ? `rotate(-35 ${M.left + gi * groupW + groupW / 2} ${h - M.bottom + 14})`
                    : undefined
                }
              >
                {g.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          className="ta-tooltip"
          style={{
            left: Math.min(hover.x + 12, w - 160),
            top: Math.max(hover.y - 12, 4),
          }}
        >
          <div className="ta-tt-title">{hover.label}</div>
          <div>
            <span className="ta-tt-key">{hover.key}</span>: <b>{hover.value}</b>
          </div>
        </div>
      )}
    </div>
  );
};
