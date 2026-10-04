import React, { useEffect, useRef, useState } from "react";
import { YulaState } from "../types/yula";
import { soundEngine } from "../utils/audioEngine";

interface YulaOrbCanvasProps {
  state: YulaState;
  micEnergy: number;
  onOrbClick: () => void;
  liveTranscript?: string;
  activeProtocolTitle?: string | null;
}

export const YulaOrbCanvas: React.FC<YulaOrbCanvasProps> = ({
  state,
  micEnergy,
  onOrbClick,
  liveTranscript,
  activeProtocolTitle,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cursorCoords, setCursorCoords] = useState<{
    r: string;
    theta: string;
    active: boolean;
  }>({ r: "0.000", theta: "000.0°", active: false });
  const [liveFreqHz, setLiveFreqHz] = useState<string>("432.0");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (
        canvas.width !== Math.floor(rect.width * dpr) ||
        canvas.height !== Math.floor(rect.height * dpr)
      ) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.27;

      ctx.clearRect(0, 0, w, h);

      // Extract real-time audio telemetry
      const { energy: outEnergy, bands } = soundEngine.getAudioTelemetry();
      const activeEnergy =
        state === "speaking" || state === "live"
          ? Math.max(outEnergy, micEnergy * 0.85)
          : state === "listening"
          ? Math.max(0.18, micEnergy)
          : state === "thinking"
          ? 0.35 + Math.sin(phase * 4) * 0.15
          : 0.06 + Math.sin(phase * 1.2) * 0.02;

      const speedMultiplier =
        state === "thinking"
          ? 2.8
          : state === "speaking" || state === "live"
          ? 1.6 + activeEnergy * 2.2
          : state === "listening"
          ? 1.4 + activeEnergy * 1.5
          : 0.55;

      phase += 0.016 * speedMultiplier;

      // Update numeric readout occasionally
      if (Math.random() < 0.15) {
        const hz = 432 + activeEnergy * 184 + Math.sin(phase) * 6;
        setLiveFreqHz(hz.toFixed(1));
      }

      // Primary color palette based on state (Cyan nominal, Amber listening/thinking, Emerald live)
      const primaryRgb =
        state === "listening"
          ? "245, 158, 11" // Telemetry Amber
          : state === "thinking"
          ? "56, 189, 248" // Sky Cyan
          : state === "live"
          ? "16, 185, 129" // Emerald Live
          : "6, 182, 212"; // Laser Cyan

      const secondaryRgb =
        state === "listening" ? "6, 182, 212" : "245, 158, 11";

      // 1. Subtle coordinate grid crosshairs
      ctx.strokeStyle = "rgba(30, 41, 59, 0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();

      // 2. Outer calibrated azimuth scale ring
      const outerGradRadius = baseRadius * 1.48;
      ctx.strokeStyle = `rgba(${primaryRgb}, 0.18)`;
      ctx.beginPath();
      ctx.arc(cx, cy, outerGradRadius, 0, Math.PI * 2);
      ctx.stroke();

      const numTicks = 72;
      for (let i = 0; i < numTicks; i++) {
        const angle = (i / numTicks) * Math.PI * 2 + phase * 0.08;
        const isMajor = i % 6 === 0;
        const innerR = outerGradRadius - (isMajor ? 8 : 4);
        const outerR = outerGradRadius + (isMajor ? 4 : 0);
        ctx.strokeStyle = isMajor
          ? `rgba(${primaryRgb}, 0.55)`
          : "rgba(100, 116, 139, 0.28)";
        ctx.lineWidth = isMajor ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
        ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
        ctx.stroke();
      }

      // 3. Rotating segmented J.A.R.V.I.S. tactical rings
      const drawSegmentedArcRing = (
        radius: number,
        segments: number,
        rotOffset: number,
        lineWidth: number,
        alpha: number,
        rgb: string
      ) => {
        ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
        ctx.lineWidth = lineWidth;
        const arcSpan = (Math.PI * 2) / segments;
        for (let i = 0; i < segments; i++) {
          const start = i * arcSpan + rotOffset;
          const end = start + arcSpan * 0.62;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, start, end);
          ctx.stroke();
        }
      };

      drawSegmentedArcRing(
        baseRadius * (1.28 + activeEnergy * 0.08),
        6,
        -phase * 0.45,
        2,
        0.5,
        primaryRgb
      );
      drawSegmentedArcRing(
        baseRadius * (1.14 + activeEnergy * 0.05),
        4,
        phase * 0.7,
        1.5,
        0.38,
        secondaryRgb
      );

      // 4. Radial Audio Frequency Bars around the Core
      const barCount = 64;
      const barBaseRadius = baseRadius * 0.92;
      for (let i = 0; i < barCount; i++) {
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        const bandIndex = i % bands.length;
        const bandVal = bands[bandIndex] || 0;
        const syntheticWave =
          Math.abs(Math.sin(angle * 4 + phase * 2.5)) * activeEnergy * 0.7;
        const magnitude = Math.max(bandVal * 0.9, syntheticWave, 0.04);
        const barLen = 6 + magnitude * (baseRadius * 0.42);

        const x1 = cx + Math.cos(angle) * barBaseRadius;
        const y1 = cy + Math.sin(angle) * barBaseRadius;
        const x2 = cx + Math.cos(angle) * (barBaseRadius + barLen);
        const y2 = cy + Math.sin(angle) * (barBaseRadius + barLen);

        ctx.strokeStyle =
          i % 4 === 0
            ? `rgba(${secondaryRgb}, ${0.35 + magnitude * 0.6})`
            : `rgba(${primaryRgb}, ${0.4 + magnitude * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // 5. Harmonic fluid neural waveform inside the core
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        const points = 120;
        const layerRadius =
          baseRadius * (0.64 - layer * 0.12) * (1 + activeEnergy * 0.18);
        for (let i = 0; i <= points; i++) {
          const theta = (i / points) * Math.PI * 2;
          const wave1 =
            Math.sin(theta * (5 + layer * 2) + phase * (2 + layer)) *
            (4 + activeEnergy * 22);
          const wave2 =
            Math.cos(theta * (3 + layer) - phase * 1.7) *
            (2 + activeEnergy * 14);
          const r = layerRadius + wave1 + wave2;
          const x = cx + Math.cos(theta) * r;
          const y = cy + Math.sin(theta) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle =
          layer === 1
            ? `rgba(${secondaryRgb}, ${0.45 + activeEnergy * 0.4})`
            : `rgba(${primaryRgb}, ${0.65 - layer * 0.15})`;
        ctx.lineWidth = layer === 0 ? 2 : 1.2;
        ctx.stroke();

        if (layer === 0) {
          const radialGrad = ctx.createRadialGradient(
            cx,
            cy,
            baseRadius * 0.05,
            cx,
            cy,
            layerRadius + 20
          );
          radialGrad.addColorStop(0, `rgba(${primaryRgb}, ${0.28 + activeEnergy * 0.25})`);
          radialGrad.addColorStop(0.6, `rgba(${primaryRgb}, 0.08)`);
          radialGrad.addColorStop(1, "rgba(7, 9, 14, 0)");
          ctx.fillStyle = radialGrad;
          ctx.fill();
        }
      }

      // 6. Central singularity nucleus & label
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        baseRadius * (0.18 + activeEnergy * 0.08),
        0,
        Math.PI * 2
      );
      ctx.fillStyle = `rgba(${primaryRgb}, 0.16)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${primaryRgb}, 0.85)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [state, micEnergy]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const maxR = Math.min(rect.width, rect.height) / 2;
    const normR = Math.min(1.5, Math.sqrt(dx * dx + dy * dy) / maxR);
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    setCursorCoords({
      r: normR.toFixed(3),
      theta: `${deg.toFixed(1).padStart(5, "0")}°`,
      active: true,
    });
  };

  const stateLabel =
    state === "live"
      ? "● НЕЙРО-КАНАЛ LIVE АКТИВЕН"
      : state === "listening"
      ? "▲ ПРИЁМ ГОЛОСОВОЙ КОМАНДЫ"
      : state === "thinking"
      ? "◆ КОГНИТИВНЫЙ СИНТЕЗ"
      : state === "speaking"
      ? "● ГОЛОСОВОЙ ОТВЕТ YULA"
      : "● ОЖИДАНИЕ ДИРЕКТИВЫ";

  const stateColor =
    state === "listening"
      ? "text-amber-400"
      : state === "live"
      ? "text-emerald-400"
      : "text-cyan-400";

  return (
    <div
      className="relative w-full h-full min-h-[340px] flex flex-col items-center justify-center select-none cursor-crosshair overflow-hidden bg-[#07090E] border border-slate-800/90"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setCursorCoords((prev) => ({ ...prev, active: false }))}
      onClick={onOrbClick}
      role="button"
      tabIndex={0}
      aria-label="Активировать голосовое ядро YULA"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOrbClick();
        }
      }}
    >
      {/* Top-Left Telemetry Coordinate Readout */}
      <div className="absolute top-4 left-4 pointer-events-none flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className={stateColor}>{stateLabel}</span>
          <span aria-hidden="true">·</span>
          <span>ЧАСТОТА: {liveFreqHz} Гц</span>
        </div>
        {activeProtocolTitle && (
          <div className="text-xs font-mono text-amber-400">
            АКТИВНЫЙ ПРОТОКОЛ: {activeProtocolTitle}
          </div>
        )}
      </div>

      {/* Top-Right Polar Vector Readout */}
      <div className="absolute top-4 right-4 pointer-events-none text-right font-mono text-xs text-slate-400">
        <div>
          ВЕКТОР r: <span className="text-slate-200">{cursorCoords.r}</span> · θ:{" "}
          <span className="text-slate-200">{cursorCoords.theta}</span>
        </div>
        <div className="text-[11px] text-slate-500">
          НАЖМИТЕ НА ЯДРО ДЛЯ ГОЛОСОВОГО ВВОДА
        </div>
      </div>

      {/* Interactive Canvas */}
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Center Core Identity Label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-display text-lg font-bold tracking-[0.22em] text-slate-100 drop-shadow">
          YULA
        </span>
        <span className="font-mono text-[10px] tracking-widest text-cyan-400/90 mt-0.5">
          CORE
        </span>
      </div>

      {/* Live Speech Transcription Subtitle Overlay */}
      {liveTranscript && (
        <div className="absolute bottom-4 left-6 right-6 pointer-events-none text-center">
          <p className="inline-block max-w-xl px-4 py-2 bg-[#0B0E17]/90 border border-cyan-500/30 text-sm text-cyan-100 font-medium">
            «{liveTranscript}»
          </p>
        </div>
      )}
    </div>
  );
};
