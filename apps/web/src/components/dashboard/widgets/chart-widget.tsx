"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartValueAsNumber } from "@/lib/charts/recharts-tooltip";
import type { ChartData } from "@/lib/dashboard/types";

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(199 89% 48%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(var(--muted-foreground))",
];

type Props = {
  chart: ChartData;
  height?: number;
};

function ChartTooltipFormatter(value: unknown): [string, string] {
  return [String(chartValueAsNumber(value)), ""];
}

/** DS-CARD-DEFAULT + chart — Recharts with design tokens. */
export function ChartWidget({ chart, height = 192 }: Props) {
  const xKey = chart.xKey ?? "name";

  return (
    <div data-component="DS-CARD-CHART" className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        {chart.type === "pie" ? (
          <PieChart>
            <Pie data={chart.data} dataKey={chart.series[0]?.dataKey ?? "value"} nameKey={xKey} cx="50%" cy="50%" outerRadius={72}>
              {chart.data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={ChartTooltipFormatter} />
          </PieChart>
        ) : chart.type === "bar" ? (
          <BarChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={ChartTooltipFormatter} />
            {chart.series.map((s, i) => (
              <Bar key={s.dataKey} dataKey={s.dataKey} fill={PIE_COLORS[i % PIE_COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        ) : chart.type === "line" ? (
          <LineChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={ChartTooltipFormatter} />
            {chart.series.map((s, i) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                stroke={PIE_COLORS[i % PIE_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        ) : (
          <AreaChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={ChartTooltipFormatter} />
            {chart.series.map((s, i) => (
              <Area
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                stroke={PIE_COLORS[i % PIE_COLORS.length]}
                fill={PIE_COLORS[i % PIE_COLORS.length]}
                fillOpacity={0.15}
              />
            ))}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
