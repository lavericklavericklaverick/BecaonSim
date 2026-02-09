
import React, { useRef, useEffect, useMemo, useState } from 'react';
import { scaleSequential, interpolateMagma, rgb } from 'd3';
import { GridData, Point } from '../types';

interface HeatmapProps {
  grid: GridData;
  threshold: number;
  ledConfig: { h: number; v: number }[];
  isFlashing: boolean;
  contourLines: Point[][];
  viewType?: 'top' | 'side';
  title?: string;
  targetBox?: { width: number; height: number; range: number };
}

const Heatmap: React.FC<HeatmapProps> = ({ grid, threshold, ledConfig, isFlashing, contourLines, viewType = 'top', title, targetBox }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data, width, height, minX, maxX, minY, maxY } = grid;
  
  const [pulse, setPulse] = useState(1);

  // Dynamic Color Scale
  const colorScale = useMemo(() => {
    const logThresh = Math.log10(threshold);
    const minLog = logThresh - 1.0; 
    const maxLog = logThresh + 4.0; // 10,000x brighter than threshold saturates to white
    
    return scaleSequential(interpolateMagma)
            .domain([minLog, maxLog])
            .clamp(true);
  }, [threshold]);

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

    // Define margins
    const marginLeft = 70;
    const marginBottom = 60;
    const marginTop = 50; 
    const marginRight = 30;

    // Drawing area dimensions
    const drawWidth = canvas.width - marginLeft - marginRight;
    const drawHeight = canvas.height - marginTop - marginBottom;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Prepare Image Data (Off-screen)
    const imgData = ctx.createImageData(width, height);
    const logThresh = Math.log10(threshold);
    const fadeStart = logThresh - 1.0;

    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      // Avoid log(0)
      const safeVal = val <= 1e-15 ? 1e-15 : val;
      const logVal = Math.log10(safeVal);
      
      const c = rgb(colorScale(logVal));
      const pxIdx = i * 4;
      
      let alpha = 255;
      if (logVal < logThresh) {
          const t = (logVal - fadeStart) / (logThresh - fadeStart);
          alpha = Math.max(0, Math.min(255, t * 255));
      }
      
      imgData.data[pxIdx] = c.r;
      imgData.data[pxIdx + 1] = c.g;
      imgData.data[pxIdx + 2] = c.b;
      imgData.data[pxIdx + 3] = alpha; 
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    tempCanvas.getContext('2d')?.putImageData(imgData, 0, 0);

    // 2. Draw Image with View Transformation
    ctx.save();
    ctx.beginPath();
    ctx.rect(marginLeft, marginTop, drawWidth, drawHeight);
    ctx.clip();
    ctx.translate(marginLeft, marginTop);
    ctx.imageSmoothingEnabled = true;

    if (viewType === 'side') {
        // Side View: x' = y, y' = x
        ctx.transform(0, 1, 1, 0, 0, 0); 
        ctx.scale(drawWidth / height, drawHeight / width);
        ctx.drawImage(tempCanvas, 0, 0);

    } else {
        // Top View:
        ctx.translate(0, drawHeight);
        ctx.scale(drawWidth / width, -drawHeight / height);
        ctx.drawImage(tempCanvas, 0, 0);
    }
    ctx.restore();

    // 3. Coordinate Mapping Function
    const mapToCanvas = (gx: number, gy: number) => {
        let sx, sy;
        if (viewType === 'side') {
             // Side View: gx=Height(X), gy=Dist(Y) -> ScreenX=Dist, ScreenY=Height
             sx = marginLeft + ((gy - minY) / (maxY - minY)) * drawWidth;
             sy = marginTop + ((gx - minX) / (maxX - minX)) * drawHeight;
        } else {
             // Top View: gx=Lat(X), gy=Dist(Y) -> ScreenX=Lat, ScreenY=Dist(Inverted)
             sx = marginLeft + ((gx - minX) / (maxX - minX)) * drawWidth;
             sy = marginTop + drawHeight - ((gy - minY) / (maxY - minY)) * drawHeight;
        }
        return { x: sx, y: sy };
    };

    // --- ADAPTIVE GRID CALCULATION ---
    const xRange = maxX - minX;
    const yRange = maxY - minY;
    const maxRange = Math.max(xRange, yRange);

    const calculateStep = (range: number) => {
        if (range <= 1e-6) return 100;
        const targetTicks = 10; // Aim for ~10 ticks
        const rawStep = range / targetTicks;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const residual = rawStep / magnitude;
        
        if (residual > 5) return 10 * magnitude;
        if (residual > 2) return 5 * magnitude;
        if (residual > 1) return 2 * magnitude;
        return magnitude;
    };

    const gridStep = calculateStep(maxRange);

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 12px monospace';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;

    const formatTick = (val: number) => {
        if (Math.abs(val) >= 10000) return `${val/1000}k`;
        return `${val}`;
    };

    // DRAW GRID & TICKS
    
    // Vertical Lines (Iterating World X)
    const startX = Math.ceil(minX / gridStep) * gridStep;
    for (let x = startX; x <= maxX + (gridStep * 0.001); x += gridStep) {
      const val = Math.round(x * 1000) / 1000;
      if (val < minX || val > maxX) continue;

      if (viewType === 'side') {
          // In Side view, X axis is Height (Vertical on screen)
          const p1 = mapToCanvas(val, minY); 
          const p2 = mapToCanvas(val, maxY); 
          
          ctx.beginPath();
          ctx.moveTo(marginLeft, p1.y); 
          ctx.lineTo(marginLeft + drawWidth, p2.y);
          ctx.stroke();

          if (Math.abs(val) > 1e-10 || minX < 0) { 
             ctx.textAlign = 'right';
             ctx.textBaseline = 'middle';
             ctx.fillText(`${formatTick(val)}m`, marginLeft - 10, p1.y);
          }

      } else {
          // In Top view, X axis is Lateral (Horizontal on screen)
          const p1 = mapToCanvas(val, minY);
          const p2 = mapToCanvas(val, maxY);
          
          ctx.beginPath();
          ctx.moveTo(p1.x, marginTop);
          ctx.lineTo(p2.x, marginTop + drawHeight);
          ctx.stroke();

          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(`${formatTick(val)}m`, p1.x, marginTop + drawHeight + 10);
      }
    }

    // Horizontal Lines (Iterating World Y)
    const startY = Math.ceil(minY / gridStep) * gridStep;
    for (let y = startY; y <= maxY + (gridStep * 0.001); y += gridStep) {
        const val = Math.round(y * 1000) / 1000;
        if (val < minY || val > maxY) continue;

        if (viewType === 'side') {
            // In Side view, Y axis is Distance (Horizontal on screen)
            const p1 = mapToCanvas(minX, val);
            const p2 = mapToCanvas(maxX, val);

            ctx.beginPath();
            ctx.moveTo(p1.x, marginTop);
            ctx.lineTo(p2.x, marginTop + drawHeight);
            ctx.stroke();

            if (val > minY) { 
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(`${formatTick(val)}m`, p1.x, marginTop + drawHeight + 10);
            }
        } else {
            // In Top view, Y axis is Distance (Vertical on screen)
            const p1 = mapToCanvas(minX, val);
            const p2 = mapToCanvas(maxX, val);

            ctx.beginPath();
            ctx.moveTo(marginLeft, p1.y);
            ctx.lineTo(marginLeft + drawWidth, p2.y);
            ctx.stroke();
            
            if (val > minY) {
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${formatTick(val)}m`, marginLeft - 10, p1.y);
            }
        }
    }
    
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Clip again for data drawing
    ctx.save();
    ctx.beginPath();
    ctx.rect(marginLeft, marginTop, drawWidth, drawHeight);
    ctx.clip();

    // Draw Target Box
    if (targetBox) {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)'; 
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 10]);
        
        const dim = viewType === 'top' ? targetBox.width : targetBox.height;
        const half = dim / 2;
        
        const c1 = mapToCanvas(-half, 0);
        const c2 = mapToCanvas(half, 0);
        const c3 = mapToCanvas(half, targetBox.range);
        const c4 = mapToCanvas(-half, targetBox.range);
        
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y);
        ctx.lineTo(c2.x, c2.y);
        ctx.lineTo(c3.x, c3.y);
        ctx.lineTo(c4.x, c4.y);
        ctx.closePath();
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(250, 204, 21, 0.8)';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText("TARGET", c3.x + 10, c3.y - 10);
        
        ctx.setLineDash([]);
    }

    // Draw Contours (Threshold)
    ctx.strokeStyle = isFlashing ? '#10b981' : '#4ade80';
    ctx.lineWidth = isFlashing ? 3 : 2;
    ctx.shadowBlur = 0; 
    
    ctx.beginPath();
    contourLines.forEach((path) => {
      if (path.length < 2) return;
      const start = mapToCanvas(path[0].x, path[0].y);
      ctx.moveTo(start.x, start.y);
      for (let i = 1; i < path.length; i++) {
        const p = mapToCanvas(path[i].x, path[i].y);
        ctx.lineTo(p.x, p.y);
      }
    });
    ctx.stroke();

    // Draw Center Line
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const centerStart = mapToCanvas(0, minY);
    const centerEnd = mapToCanvas(0, maxY);
    ctx.moveTo(centerStart.x, centerStart.y);
    ctx.lineTo(centerEnd.x, centerEnd.y);
    ctx.stroke();

    // Draw Arrows (LED Direction)
    const center = mapToCanvas(0, 0);
    
    ctx.strokeStyle = isFlashing ? '#22d3ee' : '#06b6d4';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 0; 

    ledConfig.forEach(({ h, v }) => {
      const dx = Math.sin(h) * Math.cos(v); 
      const dy = Math.cos(h) * Math.cos(v); 
      const dz = Math.sin(v);               

      let tip;
      if (viewType === 'side') {
        const worldLen = (maxY - minY) * 0.1;
        const wx = dz * worldLen; 
        const wy = dy * worldLen; 
        tip = mapToCanvas(wx, wy);

      } else {
        const worldLen = (maxY - minY) * 0.1;
        const wx = dx * worldLen; 
        const wy = dy * worldLen; 
        tip = mapToCanvas(wx, wy);
      }
      
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
    });

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // End clipping

    // Labels
    ctx.save();
    
    if (title) {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(title, 20, 15);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px sans-serif';
    
    const xLabel = viewType === 'side' ? 'DISTANCE (Y)' : 'LATERAL (X)';
    const yLabel = viewType === 'side' ? 'HEIGHT (Z)' : 'DISTANCE (Y)';
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(xLabel, marginLeft + drawWidth / 2, canvas.height - 15);

    ctx.translate(20, marginTop + drawHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(yLabel, 0, 0);

    ctx.restore();

  }, [data, threshold, colorScale, width, height, minX, maxX, minY, maxY, ledConfig, isFlashing, pulse, contourLines, viewType, title, targetBox]);

  return (
    <div className="relative w-full aspect-square lg:aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/5">
      <canvas 
        ref={canvasRef} 
        width={width * 2} 
        height={height * 2}
        className="w-full h-full object-contain"
      />
    </div>
  );
};

export default Heatmap;
