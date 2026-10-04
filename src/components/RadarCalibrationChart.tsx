import React from "react";
import { SystemModule } from "../types/yula";

interface RadarCalibrationChartProps {
  systems: SystemModule[];
}

export const RadarCalibrationChart: React.FC<RadarCalibrationChartProps> = ({
  systems,
}) => {
  const size = 210;
  const center = size / 2;
  const maxRadius = 72;
  const count = systems.length;

  const getVertex = (index: number, normalizedVal: number) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    const r = normalizedVal * maxRadius;
    return {
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
    };
  };

  const rings = [0.25, 0.5, 0.75, 1.0];

  const dataPoints = systems.map((sys, idx) => {
    const norm = sys.active
      ? Math.max(0.1, Math.min(1, (sys.value - sys.min) / (sys.max - sys.min)))
      : 0.08;
    return getVertex(idx, norm);
  });

  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        {/* Polygonal grid rings */}
        {rings.map((level) => {
          const pts = systems
            .map((_, idx) => {
              const v = getVertex(idx, level);
              return `${v.x},${v.y}`;
            })
            .join(" ");
          return (
            <polygon
              key={level}
              points={pts}
              fill="none"
              stroke="rgba(51, 65, 85, 0.55)"
              strokeWidth="1"
            />
          );
        })}

        {/* Radial axes */}
        {systems.map((sys, idx) => {
          const outer = getVertex(idx, 1.0);
          const labelPos = getVertex(idx, 1.24);
          return (
            <g key={sys.id}>
              <line
                x1={center}
                y1={center}
                x2={outer.x}
                y2={outer.y}
                stroke="rgba(51, 65, 85, 0.65)"
                strokeWidth="1"
              />
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-slate-400 font-mono text-[9px]"
              >
                {sys.name.split(" ")[0].slice(0, 8)}
              </text>
            </g>
          );
        })}

        {/* Active calibration polygon */}
        <polygon
          points={polygonPoints}
          fill="rgba(6, 182, 212, 0.18)"
          stroke="#06B6D4"
          strokeWidth="1.75"
        />

        {/* Vertex dots */}
        {dataPoints.map((pt, idx) => (
          <circle
            key={systems[idx].id}
            cx={pt.x}
            cy={pt.y}
            r={3}
            className={
              systems[idx].active ? "fill-cyan-400" : "fill-slate-600"
            }
          />
        ))}
      </svg>
    </div>
  );
};
