"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/*
 * Biểu đồ số liệu từ topic.figure (issue M3-03).
 * File này được next/dynamic nạp — chỉ khi mở tab Hình, để không làm nặng
 * trang khác. Màu nhận từ token (đã đọc computed style ở component cha),
 * đổi sáng tối là component cha vẽ lại.
 */

export type FigureInput = {
  chart_type: "bar" | "line";
  title: string;
  unit: string;
  labels: string[];
  values: number[];
};

export default function FigureChart({
  figure,
  colors,
}: {
  figure: FigureInput;
  colors: { bar: string; line: string; grid: string; tick: string; surface: string; ink: string };
}) {
  const rows = figure.labels.map((label, i) => ({ label, value: figure.values[i] }));
  const axis = { stroke: colors.tick, fontSize: 12, tickLine: false };

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {figure.chart_type === "line" ? (
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis dataKey="label" {...axis} interval={0} />
            <YAxis {...axis} width={44} />
            <Tooltip
              contentStyle={{ background: colors.surface, border: `1px solid ${colors.grid}`, borderRadius: 12, color: colors.ink, fontSize: 13 }}
              formatter={(value) => [`${Array.isArray(value) ? value[0] : value} ${figure.unit}`, figure.title]}
            />
            <Line type="monotone" dataKey="value" stroke={colors.line} strokeWidth={2.5} dot={{ r: 3, fill: colors.line }} />
          </LineChart>
        ) : (
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis dataKey="label" {...axis} interval={0} />
            <YAxis {...axis} width={44} />
            <Tooltip
              cursor={{ fill: colors.grid, opacity: 0.4 }}
              contentStyle={{ background: colors.surface, border: `1px solid ${colors.grid}`, borderRadius: 12, color: colors.ink, fontSize: 13 }}
              formatter={(value) => [`${Array.isArray(value) ? value[0] : value} ${figure.unit}`, figure.title]}
            />
            <Bar dataKey="value" fill={colors.bar} radius={[6, 6, 0, 0]} maxBarSize={56} />
          </BarChart>
        )}
      </ResponsiveContainer>
      {/* Bảng số liệu thay thế cho trình đọc màn hình: cùng dữ liệu với biểu đồ (M5-03) */}
      <table className="sr-only">
        <caption>
          {figure.title} ({figure.unit})
        </caption>
        <thead>
          <tr>
            <th scope="col">{figure.title}</th>
            <th scope="col">{figure.unit}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
