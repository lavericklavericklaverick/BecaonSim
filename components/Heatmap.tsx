
import React, { useRef, useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { GridData, Point } from '../types';

interface HeatmapProps {
  grid: GridData;
  threshold: number;
  ledConfig: { h: number; v: number }[];
  isFlashing: boolean;
  contourLines: Point[][];
  viewType?: 'top' | 'side';
  title?: string;
}

const Heatmap: React.FC<HeatmapProps> = ({ grid, threshold, ledConfig, isFlashing, contourLines, viewType = 'top', title }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data, width, height, minX, maxX, minY, maxY } = grid;
  
  const [pulse, setPulse] = useState(1);

  const colorScale = useMemo(() => {
    return d3.scaleSequential(d3.interpolateMagma).domain([-9, 0]);
  }, []);

  useEffect(() => {
    if (!isFlashing) {
      setPulse(1);
      return;
    }
    let start: number;
    let req: number;
    
    const animate = (time: number) => {
      if (!start) start = time;
      const progress = (time - start) % 1000;
      const p = 0.7 + 0.3 * Math.sin((progress / 1000) * Math.PI * 2);
      setPulse(p);
      req = requestAnimationFrame(animate);
    };
    
    req = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(req);
  }, [isFlashing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const imgData = ctx.createImageData(width, height);
    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      const logVal = val <= 0 ? -12 : Math.log10(val);
      const color = d3.rgb(colorScale(logVal));
      
      const pxIdx = i * 4;
      imgData.data[pxIdx] = color.r;
      imgData.data[pxIdx + 1] = color.g;
      imgData.data[pxIdx + 2] = color.b;
      imgData.data[pxIdx + 3] = 255;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    tempCanvas.getContext('2d')?.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.scale(canvas.width / width, -canvas.height / height);
    ctx.translate(0, -height);
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();

    const scaleX = (x: number) => ((x - minX) / (maxX - minX)) * canvas.width;
    const scaleY = (y: number) => canvas.height - ((y - minY) / (maxY - minY)) * canvas.height;

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    
    const getStep = (range: number) => {
      if (range > 20000) return 5000;
      if (range > 10000) return 2000;
      if (range > 5000) return 1000;
      if (range > 2000) return 500;
      if (range > 500) return 100;
      return 50;
    };

    const stepX = getStep(rangeX);
    const stepY = getStep(rangeY);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.5;
    
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;

    for (let x = Math.ceil(minX / stepX) * stepX; x <= maxX; x += stepX) {
      const sx = scaleX(x);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvas.height);
      ctx.stroke();
      if (Math.abs(x) > 1) {
        ctx.fillText(`${x}m`, sx + 10, canvas.height - 15);
      }
    }

    for (let y = Math.ceil(minY / stepY) * stepY; y <= maxY; y += stepY) {
      const sy = scaleY(y);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(canvas.width, sy);
      ctx.stroke();
      if (y > minY) {
        ctx.fillText(`${y}m`, 10, sy - 10);
      }
    }
    
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // contourLines passed from props
    ctx.strokeStyle = isFlashing ? '#10b981' : '#4ade80';
    ctx.lineWidth = isFlashing ? 5 : 4;
    ctx.shadowBlur = isFlashing ? 12 : 8;
    ctx.shadowColor = isFlashing ? 'rgba(16, 185, 129, 0.4)' : 'rgba(0,0,0,0.9)';
    
    ctx.beginPath();
    contourLines.forEach((path) => {
      if (path.length < 2) return;
      ctx.moveTo(scaleX(path[0].x), scaleY(path[0].y));
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(scaleX(path[i].x), scaleY(path[i].y));
      }
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scaleX(0), 0);
    ctx.lineTo(scaleX(0), canvas.height);
    ctx.stroke();

    const centerX = scaleX(0);
    const centerY = scaleY(0);
    const arrowLength = 60 * (isFlashing ? pulse : 1);

    ctx.shadowBlur = isFlashing ? 15 : 10;
    ctx.shadowColor = isFlashing ? 'rgba(6, 182, 212, 0.7)' : 'rgba(0, 255, 255, 0.5)';
    ctx.strokeStyle = isFlashing ? '#22d3ee' : '#06b6d4';
    ctx.lineWidth = isFlashing ? 4 : 3;
    ctx.lineCap = 'round';

    ledConfig.forEach(({ h, v }) => {
      // Calculate projected vector components based on view
      let projX, projY;

      if (viewType === 'side') {
        // Side View (Elevation):
        // X-axis is Height (Z), Y-axis is Forward (Y)
        // Vector:
        // Horizontal component (Z) = sin(v)
        // Vertical component (Y) = cos(h) * cos(v)
        
        projX = Math.sin(v);
        projY = Math.cos(h) * Math.cos(v);
      } else {
        // Top View (Plan):
        // X-axis is Lateral (X), Y-axis is Forward (Y)
        // Vector:
        // Horizontal component (X) = sin(h) * cos(v)
        // Vertical component (Y) = cos(h) * cos(v)
        
        projX = Math.sin(h) * Math.cos(v);
        projY = Math.cos(h) * Math.cos(v);
      }

      const endX = centerX + projX * arrowLength;
      const endY = centerY - projY * arrowLength; // Canvas Y is inverted relative to World Y

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Only draw arrowhead if the arrow has significant length
      const dist = Math.sqrt((endX - centerX)**2 + (endY - centerY)**2);
      if (dist > 5) {
        const headSize = 12 * (isFlashing ? pulse : 1);
        const headAngle = Math.PI / 7;
        const angle = Math.atan2(endY - centerY, endX - centerX);
        
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headSize * Math.cos(angle - headAngle),
          endY - headSize * Math.sin(angle - headAngle)
        );
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headSize * Math.cos(angle + headAngle),
          endY - headSize * Math.sin(angle + headAngle)
        );
        ctx.stroke();
      }
    });

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
    ctx.fill();

    // Draw Title/Axis Labels
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textBaseline = 'top';
    
    // View Title
    if (title) {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(title, 20, 20);
    }

    // Axis Labels
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px sans-serif';
    const xLabel = viewType === 'side' ? 'HEIGHT (Z)' : 'LATERAL (X)';
    const yLabel = 'DISTANCE (Y)';
    
    // Draw X Label centered at bottom
    ctx.textAlign = 'center';
    ctx.fillText(xLabel, canvas.width / 2, canvas.height - 40);

    // Draw Y Label rotated on left
    ctx.translate(30, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);

    ctx.restore();

  }, [data, threshold, colorScale, width, height, minX, maxX, minY, maxY, ledConfig, isFlashing, pulse, contourLines, viewType, title]);

  const displayThreshold = isFlashing ? threshold / 8 : threshold;

  return (
    <div className="relative w-full aspect-square lg:aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/5">
      <canvas 
        ref={canvasRef} 
        width={width * 2} 
        height={height * 2}
        className="w-full h-full object-contain"
      />
      
      <div className="absolute top-6 right-6 bg-gray-950/80 backdrop-blur-xl p-5 rounded-2xl border border-white/10 text-xs shadow-2xl space-y-4 max-w-[200px]">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full border border-white shadow-[0_0_12px_rgba(74,222,128,0.6)] ${isFlashing ? 'bg-emerald-400 animate-pulse' : 'bg-green-400'}`}></div>
            <span className="font-black tracking-tight text-white uppercase italic">Detection: {displayThreshold.toExponential(1)} lx</span>
          </div>
          {isFlashing && <div className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest pl-7">Temporal Boost (8x)</div>}
        </div>
        
        <div className="flex items-center gap-3">
          <div className={`w-4 h-1 bg-cyan-400 rounded-full border border-white shadow-[0_0_8px_rgba(6,182,212,0.8)] ${isFlashing ? 'animate-pulse' : ''}`}></div>
          <span className="font-black tracking-tight text-white uppercase italic">LED Axis</span>
        </div>
        
        <div className="space-y-2">
           <div className="h-3 w-full rounded-full bg-gradient-to-r from-[#000004] via-[#721f81] via-[#f1605d] to-[#fcfdbf]"></div>
           <div className="flex justify-between text-[10px] text-gray-500 font-mono font-bold">
             <span>10⁻⁹ lx</span>
             <span>1 lx</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Heatmap;
