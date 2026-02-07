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

  const colorScale = useMemo(() => {
    return scaleSequential(interpolateMagma).domain([-9, 0]);
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

    // Define margins for axes and title to prevent overlap
    const marginLeft = 70; // Increased margin for larger fonts
    const marginBottom = 60; // Increased margin for larger fonts
    const marginTop = 50; 
    const marginRight = 30;

    // Drawing area dimensions
    const drawWidth = canvas.width - marginLeft - marginRight;
    const drawHeight = canvas.height - marginTop - marginBottom;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Prepare Image Data (Off-screen)
    const imgData = ctx.createImageData(width, height);
    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      const logVal = val <= 0 ? -12 : Math.log10(val);
      const color = rgb(colorScale(logVal));
      
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

    // 2. Draw Image with View Transformation into the Drawing Area
    ctx.save();
    
    // Clip to drawing area
    ctx.beginPath();
    ctx.rect(marginLeft, marginTop, drawWidth, drawHeight);
    ctx.clip();

    // Translate to drawing area origin
    ctx.translate(marginLeft, marginTop);

    if (viewType === 'side') {
        // Rotate 90 deg Clockwise: Transpose Coordinates
        // Grid X (Height) becomes Screen Y (Down)
        // Grid Y (Distance) becomes Screen X (Right)
        // Transformation: Input(x,y) -> Output(y,x)
        // x' = 0*x + 1*y = y
        // y' = 1*x + 0*y = x
        ctx.transform(0, 1, 1, 0, 0, 0);
        
        // We need to scale the transformed output to fit drawWidth/drawHeight.
        // Image Y (Distance) -> Screen X (Width). Scale factor = drawWidth / height
        // Image X (Height)   -> Screen Y (Height). Scale factor = drawHeight / width
        // NOTE: ctx.scale applies to the coordinates before transform if called after? 
        // No, current matrix = T. New matrix = T * S.
        // Point P -> T * S * P.
        // S * P = (x*sx, y*sy).
        // T * (S*P) = (y*sy, x*sx).
        // We want (y*sy) to be Width. So sy = drawWidth/height.
        // We want (x*sx) to be Height. So sx = drawHeight/width.
        
        ctx.scale(drawHeight / width, drawWidth / height);
        
        ctx.drawImage(tempCanvas, 0, 0);
    } else {
        // Standard Top View: Flip Y
        // Grid X (Lateral) -> Screen X
        // Grid Y (Distance) -> Screen Y (Inverted)
        
        ctx.scale(drawWidth / width, -drawHeight / height);
        ctx.translate(0, -height);
        ctx.drawImage(tempCanvas, 0, 0);
    }
    ctx.restore();

    // 3. Coordinate Mapping Function
    // Maps World Coordinates (Grid Units) to Canvas Coordinates (Pixels) relative to full canvas
    const mapToCanvas = (gx: number, gy: number) => {
        let sx, sy;
        if (viewType === 'side') {
             // Side View (Rotated):
             // gx = Height (World Z), gy = Distance (World Y)
             // Screen X = Distance (0 to Max)
             // Screen Y = Height (Min to Max) -> Downwards (Grid logic maps minX to top of screen in this transform)
             
             // X axis is Distance (gy)
             sx = marginLeft + ((gy - minY) / (maxY - minY)) * drawWidth;
             
             // Y axis is Height (gx)
             sy = marginTop + ((gx - minX) / (maxX - minX)) * drawHeight;

        } else {
             // Top View:
             // gx = Lateral (World X), gy = Distance (World Y)
             // Screen X = Lateral
             sx = marginLeft + ((gx - minX) / (maxX - minX)) * drawWidth;
             // Screen Y = Distance (Inverted)
             sy = marginTop + drawHeight - ((gy - minY) / (maxY - minY)) * drawHeight;
        }
        return { x: sx, y: sy };
    };

    const gridStep = 100;
    const labelStep = 500;

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 16px monospace'; // Increased Font Size
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;

    // DRAW GRID & TICKS
    
    // Vertical Lines (Constant World X / Lateral / Height)
    for (let x = Math.ceil(minX / gridStep) * gridStep; x <= maxX; x += gridStep) {
      if (viewType === 'side') {
          // Side View: X is Height (Vertical axis)
          const p1 = mapToCanvas(x, minY); // Height x, Dist min
          const p2 = mapToCanvas(x, maxY); // Height x, Dist max
          
          ctx.beginPath();
          ctx.moveTo(marginLeft, p1.y); // Clamp to margin
          ctx.lineTo(marginLeft + drawWidth, p2.y);
          ctx.stroke();

          // Label on Left
          if (Math.abs(x % labelStep) < 1) {
             if (x !== 0 || minX < 0) { 
                 ctx.textAlign = 'right';
                 ctx.textBaseline = 'middle';
                 ctx.fillText(`${x}m`, marginLeft - 15, p1.y);
             }
          }

      } else {
          // Top View: X is Lateral (Horizontal axis)
          // Vertical lines
          const p1 = mapToCanvas(x, minY);
          const p2 = mapToCanvas(x, maxY);
          
          ctx.beginPath();
          ctx.moveTo(p1.x, marginTop);
          ctx.lineTo(p2.x, marginTop + drawHeight);
          ctx.stroke();

          // Label on Bottom
          if (Math.abs(x % labelStep) < 1) {
              if (Math.abs(x) > 1) {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(`${x}m`, p1.x, marginTop + drawHeight + 15);
              }
          }
      }
    }

    // Iterate World Y (Distance)
    for (let y = Math.ceil(minY / gridStep) * gridStep; y <= maxY; y += gridStep) {
        if (viewType === 'side') {
            // Side View: Y is Distance (Horizontal axis)
            // Vertical lines
            const p1 = mapToCanvas(minX, y);
            const p2 = mapToCanvas(maxX, y);

            ctx.beginPath();
            ctx.moveTo(p1.x, marginTop);
            ctx.lineTo(p2.x, marginTop + drawHeight);
            ctx.stroke();

            // Label on Bottom
            if (Math.abs(y % labelStep) < 1) {
                if (y > minY) {
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(`${y}m`, p1.x, marginTop + drawHeight + 15);
                }
            }
        } else {
            // Top View: Y is Distance (Vertical axis)
            // Horizontal lines
            const p1 = mapToCanvas(minX, y);
            const p2 = mapToCanvas(maxX, y);

            ctx.beginPath();
            ctx.moveTo(marginLeft, p1.y);
            ctx.lineTo(marginLeft + drawWidth, p2.y);
            ctx.stroke();
            
            // Label on Left
            if (Math.abs(y % labelStep) < 1) {
                if (y > minY) {
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`${y}m`, marginLeft - 15, p1.y);
                }
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
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)'; // Yellow
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
        
        // Label
        ctx.fillStyle = 'rgba(250, 204, 21, 0.8)';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText("TARGET", c3.x + 10, c3.y - 10);
        
        ctx.setLineDash([]);
    }

    // Draw Contours
    ctx.strokeStyle = isFlashing ? '#10b981' : '#4ade80';
    ctx.lineWidth = isFlashing ? 4 : 3;
    ctx.shadowBlur = isFlashing ? 12 : 8;
    ctx.shadowColor = isFlashing ? 'rgba(16, 185, 129, 0.4)' : 'rgba(0,0,0,0.9)';
    
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
    ctx.shadowBlur = 0;

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
    const scaleFactor = Math.min(drawWidth, drawHeight) * 0.15 * (isFlashing ? pulse : 1);

    ctx.shadowBlur = isFlashing ? 15 : 10;
    ctx.shadowColor = isFlashing ? 'rgba(6, 182, 212, 0.7)' : 'rgba(0, 255, 255, 0.5)';
    ctx.strokeStyle = isFlashing ? '#22d3ee' : '#06b6d4';
    ctx.lineWidth = isFlashing ? 3 : 2;
    ctx.lineCap = 'round';

    ledConfig.forEach(({ h, v }) => {
      let projX, projY; 

      // 3D Direction Vector
      const dx = Math.sin(h) * Math.cos(v); // Lateral
      const dy = Math.cos(h) * Math.cos(v); // Forward
      const dz = Math.sin(v);               // Up

      let tip;

      if (viewType === 'side') {
        const worldLen = (maxY - minY) * 0.1;
        const wx = dz * worldLen; // Height
        const wy = dy * worldLen; // Distance
        tip = mapToCanvas(wx, wy);

      } else {
        const worldLen = (maxY - minY) * 0.1;
        const wx = dx * worldLen; // Lateral
        const wy = dy * worldLen; // Distance
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

    // Draw Title/Axis Labels (Outside clip)
    ctx.save();
    
    // View Title (Top Left)
    if (title) {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(title, 20, 15);
    }

    // Axis Labels
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px sans-serif';
    
    const xLabel = viewType === 'side' ? 'DISTANCE (Y)' : 'LATERAL (X)';
    const yLabel = viewType === 'side' ? 'HEIGHT (Z)' : 'DISTANCE (Y)';
    
    // Bottom Axis Label
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(xLabel, marginLeft + drawWidth / 2, canvas.height - 15);

    // Left Axis Label (Rotated)
    ctx.translate(20, marginTop + drawHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(yLabel, 0, 0);

    ctx.restore();

  }, [data, threshold, colorScale, width, height, minX, maxX, minY, maxY, ledConfig, isFlashing, pulse, contourLines, viewType, title, targetBox]);

  const displayThreshold = isFlashing ? threshold / 8 : threshold;

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