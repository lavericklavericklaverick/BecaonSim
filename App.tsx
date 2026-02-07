
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { SimulationParams, GridData, ColorPreset, BeamPoint, Point, Point3D } from './types';
import { GRID_RES, COLOR_PRESETS, DEFAULT_BEAM_PATTERN, DEFAULT_GRID_LIMITS } from './constants';
import { getEffectiveEfficiency, calculateIlluminance } from './physics';
import { marchSquares } from './utils/marchSquares';
import { downloadDXF } from './utils/dxfExporter';
import Heatmap from './components/Heatmap';
import View3D from './components/View3D';

/**
 * Interface for CollapsibleSection props
 */
interface CollapsibleSectionProps {
  title: string;
  icon: string;
  children?: React.ReactNode;
  defaultOpen?: boolean;
}

/**
 * A collapsible container for grouping controls
 */
const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, icon, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/5 last:border-0">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between py-4 px-4 hover:bg-white/5 transition-colors group text-left">
        <div className="flex items-center gap-3">
          <i className={`fas ${icon} text-gray-500 group-hover:text-indigo-400 transition-colors w-5 text-center`}></i>
          <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest group-hover:text-white transition-colors">{title}</span>
        </div>
        <i className={`fas fa-chevron-down text-[10px] text-gray-600 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}></i>
      </button>
      {isOpen && <div className="px-4 pb-6 animate-in fade-in slide-in-from-top-2 duration-300">{children}</div>}
    </div>
  );
};

/**
 * Interface for SliderProps
 */
interface SliderProps {
  label: string;
  val: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (val: number) => void;
  color?: string;
}

/**
 * Custom styled slider for simulation parameters
 */
const ControlSlider: React.FC<SliderProps> = ({ label, val, min, max, step, unit = "", onChange, color = "accent-indigo-500" }) => (
  <div className="group">
    <label className="flex justify-between text-[11px] font-black text-gray-500 mb-3 uppercase tracking-wider group-hover:text-gray-300 transition-colors">
      <span>{label}</span>
      <span className="font-mono text-indigo-400 bg-indigo-500/10 px-2 rounded-md">{val.toFixed(step < 1 ? 1 : 0)}{unit}</span>
    </label>
    <input type="range" min={min} max={max} step={step} value={val} onChange={e => onChange(parseFloat(e.target.value))}
      className={`w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-white/10 transition-colors ${color}`} />
  </div>
);

// Helper to generate LED config (extracted for use in optimizer)
const generateLedConfig = (ledCount: number, spreadAngle: number, rowCount: number, verticalSpreadAngle: number) => {
    const configs: { h: number; v: number }[] = [];
    
    // Horizontal Angles (Yaw)
    const hAngles: number[] = [];
    if (ledCount === 1) {
      hAngles.push(0);
    } else {
      const half = (spreadAngle * Math.PI) / 180;
      const step = (half * 2) / (ledCount - 1);
      for (let i = 0; i < ledCount; i++) {
        hAngles.push(-half + i * step);
      }
    }

    // Vertical Angles (Pitch)
    const vAngles: number[] = [];
    if (rowCount === 1) {
      vAngles.push(0);
    } else {
      const half = (verticalSpreadAngle * Math.PI) / 180;
      const step = (half * 2) / (rowCount - 1);
      for (let i = 0; i < rowCount; i++) {
        vAngles.push(-half + i * step);
      }
    }

    // Cartesian Product
    for (const h of hAngles) {
      for (const v of vAngles) {
        configs.push({ h, v });
      }
    }
    return configs;
};

interface OptResult {
  h: number;
  v: number;
  vol: number;
  w: number;
  hDim: number;
  r: number;
}

const App: React.FC = () => {
  const [params, setParams] = useState<SimulationParams>({
    ledCount: 3,
    spreadAngle: 45,
    rowCount: 1,
    verticalSpreadAngle: 0,
    peakCandela: 1.0, 
    wavelength: 525, 
    logThreshold: -6,
    isFlashing: false,
    beamPattern: JSON.parse(JSON.stringify(DEFAULT_BEAM_PATTERN)),
    gridLimits: { ...DEFAULT_GRID_LIMITS }
  });

  const [optTargets, setOptTargets] = useState({ width: 1000, height: 600, range: 2000 });
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optResults, setOptResults] = useState<OptResult[]>([]);

  const [topGrid, setTopGrid] = useState<GridData | null>(null);
  const [sideGrid, setSideGrid] = useState<GridData | null>(null);
  const [slices3D, setSlices3D] = useState<Point3D[][]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [activeTab, setActiveTab] = useState<'2D' | '3D'>('2D');

  const effectiveEfficiency = useMemo(() => getEffectiveEfficiency(params.wavelength), [params.wavelength]);
  
  // Calculate full 3D configuration of LEDs {h, v}
  const ledConfig = useMemo(() => {
    return generateLedConfig(params.ledCount, params.spreadAngle, params.rowCount, params.verticalSpreadAngle);
  }, [params.ledCount, params.spreadAngle, params.rowCount, params.verticalSpreadAngle]);

  const runSimulation = useCallback(() => {
    setIsCalculating(true);
    
    setTimeout(() => {
      const { minX, maxX, minY, maxY } = params.gridLimits;
      
      const minZ = minX; // Assuming symmetric vertical range for calculation
      const maxZ = maxX;

      const topData = new Float32Array(GRID_RES * GRID_RES);
      const sideData = new Float32Array(GRID_RES * GRID_RES);
      
      const dx = (maxX - minX) / (GRID_RES - 1);
      const dy = (maxY - minY) / (GRID_RES - 1);
      const dz = (maxZ - minZ) / (GRID_RES - 1);

      // --- 1. Top View (XY Plane, Z=0) ---
      for (let gy = 0; gy < GRID_RES; gy++) {
        const y = minY + gy * dy;
        for (let gx = 0; gx < GRID_RES; gx++) {
          const x = minX + gx * dx;
          let total = 0;
          for (const cfg of ledConfig) {
            total += calculateIlluminance(x, y, 0, cfg.h, cfg.v, params.peakCandela, effectiveEfficiency, params.beamPattern);
          }
          topData[gy * GRID_RES + gx] = total;
        }
      }

      // --- 2. Side View (YZ Plane, X=0) ---
      for (let gy = 0; gy < GRID_RES; gy++) {
        const y = minY + gy * dy; 
        for (let gx = 0; gx < GRID_RES; gx++) {
          const z = minZ + gx * dz; // World Z maps to Grid X
          let total = 0;
          for (const cfg of ledConfig) {
            total += calculateIlluminance(0, y, z, cfg.h, cfg.v, params.peakCandela, effectiveEfficiency, params.beamPattern);
          }
          sideData[gy * GRID_RES + gx] = total;
        }
      }

      setTopGrid({
        data: topData,
        width: GRID_RES,
        height: GRID_RES,
        minX: minX, maxX: maxX, minY: minY, maxY: maxY
      });

      setSideGrid({
        data: sideData,
        width: GRID_RES,
        height: GRID_RES,
        minX: minZ, maxX: maxZ, minY: minY, maxY: maxY
      });

      // --- 3. 3D Wireframe Slices ---
      // Use odd number for resolution to ensure center pixel (0,0) is sampled
      const SLICE_RES = 151; 
      const NUM_SLICES = 60; // Increased density for tighter lines
      const slicePaths: Point3D[][] = [];
      const threshold = params.isFlashing ? Math.pow(10, params.logThreshold) / 8 : Math.pow(10, params.logThreshold);

      // Helper for slice data
      const getSliceData = (
        width: number, height: number, 
        minA: number, maxA: number, 
        minB: number, maxB: number,
        fixedCoord: number, 
        isHorizontalSlice: boolean // true = varies in Z (Plan slices), false = varies in X (Side slices)
      ): GridData => {
        const data = new Float32Array(width * height);
        const da = (maxA - minA) / (width - 1);
        const db = (maxB - minB) / (height - 1);

        for (let gy = 0; gy < height; gy++) {
          const b = minB + gy * db; // Usually Y (Distance)
          for (let gx = 0; gx < width; gx++) {
            const a = minA + gx * da; // X or Z
            let total = 0;
            // Map grid coords to world coords
            const wx = isHorizontalSlice ? a : fixedCoord;
            const wy = b;
            const wz = isHorizontalSlice ? fixedCoord : a;

            for (const cfg of ledConfig) {
              total += calculateIlluminance(wx, wy, wz, cfg.h, cfg.v, params.peakCandela, effectiveEfficiency, params.beamPattern);
            }
            data[gy * width + gx] = total;
          }
        }
        return { data, width, height, minX: minA, maxX: maxA, minY: minB, maxY: maxB };
      };

      // Generate step locations ensuring 0 is included
      const generateSteps = (min: number, max: number, count: number) => {
        const steps = new Set<number>();
        steps.add(0); // CRITICAL: Always include center slice where intensity is max
        const inc = (max - min) / count;
        for (let i = 0; i <= count; i++) {
            steps.add(min + i * inc);
        }
        return Array.from(steps).sort((a, b) => a - b);
      };

      // A. Horizontal Slices (Fixed Z)
      const zSteps = generateSteps(minZ, maxZ, NUM_SLICES);
      for (const z of zSteps) {
        const grid = getSliceData(SLICE_RES, SLICE_RES, minX, maxX, minY, maxY, z, true);
        const paths = marchSquares(grid, threshold);
        // Convert 2D paths to 3D
        paths.forEach(p2d => {
            const p3dArray: Point3D[] = p2d.map(p => ({ x: p.x, y: p.y, z: z }));
            slicePaths.push(p3dArray);
        });
      }

      // B. Vertical Slices (Fixed X)
      const xSteps = generateSteps(minX, maxX, NUM_SLICES);
      for (const x of xSteps) {
        const grid = getSliceData(SLICE_RES, SLICE_RES, minZ, maxZ, minY, maxY, x, false);
        const paths = marchSquares(grid, threshold);
        // Convert 2D paths to 3D
        paths.forEach(p2d => {
            // Grid X was Z, Grid Y was Y
            const p3dArray: Point3D[] = p2d.map(p => ({ x: x, y: p.y, z: p.x }));
            slicePaths.push(p3dArray);
        });
      }

      setSlices3D(slicePaths);
      setIsCalculating(false);

    }, 0);
  }, [
      ledConfig, 
      params.peakCandela, 
      effectiveEfficiency, 
      params.beamPattern, 
      params.gridLimits, 
      params.logThreshold, 
      params.isFlashing
    ]);

  useEffect(() => {
    const timer = setTimeout(() => {
        runSimulation();
    }, 100);
    return () => clearTimeout(timer);
  }, [runSimulation]);

  const contourPathsTop = useMemo(() => {
    if (!topGrid) return [];
    const effectiveThreshold = params.isFlashing ? Math.pow(10, params.logThreshold) / 8 : Math.pow(10, params.logThreshold);
    return marchSquares(topGrid, effectiveThreshold);
  }, [topGrid, params.logThreshold, params.isFlashing]);

  const contourPathsSide = useMemo(() => {
    if (!sideGrid) return [];
    const effectiveThreshold = params.isFlashing ? Math.pow(10, params.logThreshold) / 8 : Math.pow(10, params.logThreshold);
    return marchSquares(sideGrid, effectiveThreshold);
  }, [sideGrid, params.logThreshold, params.isFlashing]);

  const updateParam = <K extends keyof SimulationParams>(key: K, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const updateGridLimit = (field: keyof typeof DEFAULT_GRID_LIMITS, value: number) => {
    setParams(prev => ({
      ...prev,
      gridLimits: { ...prev.gridLimits, [field]: value }
    }));
  };

  const updateBeamPoint = (index: number, field: keyof BeamPoint, value: number) => {
    const newPattern = [...params.beamPattern];
    newPattern[index] = { ...newPattern[index], [field]: value };
    updateParam('beamPattern', newPattern);
  };

  const handleExportCAD = () => {
    if (contourPathsTop.length === 0) return;
    downloadDXF(contourPathsTop, `LED_Visibility_${params.wavelength}nm_${params.isFlashing ? 'Flash' : 'Steady'}.dxf`);
  };

  const applyOptResult = (res: OptResult) => {
    setParams(prev => ({
      ...prev,
      spreadAngle: res.h,
      verticalSpreadAngle: res.v
    }));
  };

  const handleOptimize = useCallback(async () => {
    setIsOptimizing(true);
    setOptResults([]);
    
    // Defer to allow UI render
    await new Promise(r => setTimeout(r, 50));

    const threshold = params.isFlashing ? Math.pow(10, params.logThreshold) / 8 : Math.pow(10, params.logThreshold);
    
    // Optimization Helper: Binary search to find extent of beam in a specific direction
    const findExtent = (
        cfg: {h:number, v:number}[], 
        startP: Point3D, 
        dir: Point3D, 
        maxDist: number
    ): number => {
        let low = 0;
        let high = maxDist;
        let limit = 0;
        
        for(let i=0; i<16; i++) { 
            const mid = (low + high) / 2;
            const x = startP.x + dir.x * mid;
            const y = startP.y + dir.y * mid;
            const z = startP.z + dir.z * mid;
            
            let total = 0;
            for (const c of cfg) {
                total += calculateIlluminance(x, y, z, c.h, c.v, params.peakCandela, effectiveEfficiency, params.beamPattern);
            }
            
            if (total >= threshold) {
                limit = mid; 
                low = mid;
            } else {
                high = mid; 
            }
        }
        return limit;
    };

    const validResults: OptResult[] = [];
    const step = 2; 
    
    for (let h = 0; h <= 80; h += step) {
        for (let v = 0; v <= 80; v += step) {
             const cfg = generateLedConfig(params.ledCount, h, params.rowCount, v);
             
             // 1. Find Max Range (Y) along center line
             const range = findExtent(cfg, {x:0, y:0, z:0}, {x:0, y:1, z:0}, 50000);
             if (range < 1) continue;

             // 2. Find Width (X) at mid-range (Lateral)
             const halfWidth = findExtent(cfg, {x:0, y:range * 0.5, z:0}, {x:1, y:0, z:0}, 20000);
             const width = halfWidth * 2;

             // 3. Find Height (Z) at mid-range (Elevation)
             const halfHeight = findExtent(cfg, {x:0, y:range * 0.5, z:0}, {x:0, y:0, z:1}, 20000);
             const height = halfHeight * 2;

             // 4. Check Constraints
             if (width >= optTargets.width && height >= optTargets.height && range >= optTargets.range) {
                 const vol = width * height * range;
                 validResults.push({ h, v, vol, w: width, hDim: height, r: range });
             }
        }
    }
    
    // Sort by volume descending
    validResults.sort((a, b) => b.vol - a.vol);
    setOptResults(validResults);
    setIsOptimizing(false);

  }, [params.ledCount, params.rowCount, params.peakCandela, params.beamPattern, params.isFlashing, params.logThreshold, effectiveEfficiency, optTargets]);


  return (
    <div className="max-w-[1800px] mx-auto px-6 py-10 bg-gray-950 min-h-screen text-gray-200 selection:bg-indigo-500/30">
      <header className="mb-10 border-b border-white/5 pb-8 flex items-center gap-6">
        <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 via-indigo-500 to-emerald-400 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/20 rotate-3 transition-transform hover:rotate-0 duration-500 cursor-pointer flex-shrink-0">
           <i className="fas fa-flux-capacitor text-white text-2xl"></i>
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-white leading-tight">
            LED PROPAGATION
          </h1>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-1 opacity-80">
            Composite Vision Engine v2.5
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <aside className="lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="bg-gray-900/50 border border-white/5 rounded-[2rem] p-4 shadow-2xl backdrop-blur-3xl space-y-2">
            
            <CollapsibleSection title="Array Configuration" icon="fa-th" defaultOpen={true}>
              <div className="space-y-6 py-2">
                <div className="bg-white/5 rounded-xl p-3 mb-2">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-4">Plan (Horizontal)</span>
                    <ControlSlider label="LED Columns" val={params.ledCount} min={1} max={20} step={1} onChange={v => updateParam('ledCount', v)} />
                    <ControlSlider label="Plan Spread" val={params.spreadAngle} unit="°" min={0} max={180} step={1} onChange={v => updateParam('spreadAngle', v)} />
                </div>
                
                <div className="bg-white/5 rounded-xl p-3">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-4">Elevation (Vertical)</span>
                    <ControlSlider label="LED Rows" val={params.rowCount} min={1} max={20} step={1} onChange={v => updateParam('rowCount', v)} />
                    <ControlSlider label="Elev Spread" val={params.verticalSpreadAngle} unit="°" min={0} max={180} step={1} onChange={v => updateParam('verticalSpreadAngle', v)} />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Auto-Optimizer" icon="fa-magic" defaultOpen={true}>
              <div className="py-2 space-y-4">
                <p className="text-[10px] text-gray-500 leading-relaxed">
                   Calculates options (0-80°) matching min dimensions. Click row to apply.
                </p>
                <div className="grid grid-cols-3 gap-2">
                    <div className="bg-black/40 rounded-xl p-2 border border-white/5">
                        <label className="text-[8px] font-bold text-gray-400 uppercase block mb-1">Min Width</label>
                        <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              value={optTargets.width} 
                              onChange={e => setOptTargets(prev => ({ ...prev, width: parseFloat(e.target.value) }))}
                              className="w-full bg-transparent text-white font-mono text-xs outline-none" 
                            />
                            <span className="text-[9px] text-gray-600">m</span>
                        </div>
                    </div>
                    <div className="bg-black/40 rounded-xl p-2 border border-white/5">
                        <label className="text-[8px] font-bold text-gray-400 uppercase block mb-1">Min Height</label>
                        <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              value={optTargets.height} 
                              onChange={e => setOptTargets(prev => ({ ...prev, height: parseFloat(e.target.value) }))}
                              className="w-full bg-transparent text-white font-mono text-xs outline-none" 
                            />
                            <span className="text-[9px] text-gray-600">m</span>
                        </div>
                    </div>
                    <div className="bg-black/40 rounded-xl p-2 border border-white/5">
                        <label className="text-[8px] font-bold text-gray-400 uppercase block mb-1">Min Range</label>
                        <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              value={optTargets.range} 
                              onChange={e => setOptTargets(prev => ({ ...prev, range: parseFloat(e.target.value) }))}
                              className="w-full bg-transparent text-white font-mono text-xs outline-none" 
                            />
                            <span className="text-[9px] text-gray-600">m</span>
                        </div>
                    </div>
                </div>
                <button 
                  onClick={handleOptimize}
                  disabled={isOptimizing}
                  className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                >
                  {isOptimizing ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white">Scanning...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-search text-xs text-yellow-300 group-hover:animate-pulse"></i>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white">Find Options</span>
                    </>
                  )}
                </button>
                
                {optResults.length > 0 ? (
                  <div className="mt-2 bg-black/40 rounded-xl border border-white/5 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-[10px] text-left border-collapse">
                      <thead className="sticky top-0 bg-gray-900 text-gray-400 font-bold uppercase tracking-wider shadow-sm z-10">
                        <tr>
                          <th className="p-3">Spread</th>
                          <th className="p-3">Range</th>
                          <th className="p-3">Vol (Gm³)</th>
                          <th className="p-3 text-right">Set</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {optResults.map((res, i) => (
                          <tr key={i} className="hover:bg-indigo-500/10 transition-colors group/row cursor-pointer" onClick={() => applyOptResult(res)}>
                             <td className="p-3 font-mono text-white">
                                <div className="flex flex-col">
                                   <span className="text-gray-300">H: <b className="text-white">{res.h}°</b></span>
                                   <span className="text-gray-500">V: {res.v}°</span>
                                </div>
                             </td>
                             <td className="p-3 font-mono text-gray-400">{(res.r/1000).toFixed(1)}km</td>
                             <td className="p-3 font-mono text-emerald-400 font-bold">{(res.vol/1e9).toFixed(2)}</td>
                             <td className="p-3 text-right">
                                <button className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center group-hover/row:bg-indigo-500 transition-colors">
                                    <i className="fas fa-arrow-right text-[8px] text-gray-500 group-hover/row:text-white"></i>
                                </button>
                             </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : !isOptimizing && (
                   <div className="p-3 text-center text-[10px] text-gray-600 italic border border-white/5 rounded-xl border-dashed">
                      No configurations found matching current constraints.
                   </div>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Optical Parameters" icon="fa-lightbulb" defaultOpen={false}>
              <div className="space-y-6 py-2">
                <ControlSlider label="Peak Intensity" val={params.peakCandela} unit=" cd" min={0} max={5} step={0.1} onChange={v => updateParam('peakCandela', v)} />
                <ControlSlider label="Wavelength" val={params.wavelength} unit=" nm" min={380} max={700} step={5} onChange={v => updateParam('wavelength', v)} />
                
                <div className="pt-2">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest group-hover:text-white transition-colors">Temporal Mode</span>
                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                      <button 
                        onClick={() => updateParam('isFlashing', false)}
                        className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${!params.isFlashing ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-500 hover:text-gray-300'}`}
                      >Steady</button>
                      <button 
                        onClick={() => updateParam('isFlashing', true)}
                        className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${params.isFlashing ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-gray-500 hover:text-gray-300'}`}
                      >Flashing</button>
                    </div>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  {COLOR_PRESETS.map((p) => (
                    <button key={p.wavelength} onClick={() => updateParam('wavelength', p.wavelength)} 
                      className={`w-7 h-7 rounded-lg border-2 transition-all ${params.wavelength === p.wavelength ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-40 hover:opacity-100'}`} 
                      style={{ backgroundColor: p.hex }} title={p.name} />
                  ))}
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Beam Pattern Table" icon="fa-chart-area" defaultOpen={false}>
              <div className="py-2">
                <div className="rounded-2xl border border-white/5 overflow-hidden bg-black/30">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-white/5 text-gray-500 font-black uppercase tracking-widest">
                      <tr><th className="px-4 py-3">Angle (°)</th><th className="px-4 py-3">Intensity</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {params.beamPattern.map((pt, i) => (
                        <tr key={i} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-2">
                            <input type="number" value={pt.angle} onChange={e => updateBeamPoint(i, 'angle', parseFloat(e.target.value))} className="bg-transparent w-full outline-none text-white" disabled={i===0} />
                          </td>
                          <td className="px-4 py-2">
                            <input type="number" step="0.01" value={pt.intensity} onChange={e => updateBeamPoint(i, 'intensity', parseFloat(e.target.value))} className="bg-transparent w-full outline-none text-indigo-400" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="View Limits" icon="fa-expand-arrows-alt" defaultOpen={false}>
              <div className="space-y-6 py-2">
                <ControlSlider label="Lateral Range" val={params.gridLimits.maxX} unit="m" min={100} max={20000} step={100} onChange={v => {
                  updateGridLimit('maxX', v);
                  updateGridLimit('minX', -v);
                }} />
                <ControlSlider label="Forward Range" val={params.gridLimits.maxY} unit="m" min={100} max={20000} step={100} onChange={v => updateGridLimit('maxY', v)} />
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Detection Threshold" icon="fa-low-vision" defaultOpen={true}>
              <div className="py-2">
                 <ControlSlider label="Log₁₀ lx" val={params.logThreshold} min={-12} max={-2} step={0.1} onChange={v => updateParam('logThreshold', v)} color="accent-emerald-500" />
              </div>
            </CollapsibleSection>
          </div>
        </aside>

        <main className="lg:col-span-8 xl:col-span-9 space-y-6">
          {/* Tab Navigation */}
          <div className="flex items-center space-x-6 border-b border-white/5 mb-4">
             <button 
               onClick={() => setActiveTab('2D')} 
               className={`pb-4 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === '2D' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
             >
               2D Analysis
               {activeTab === '2D' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></span>}
             </button>
             <button 
               onClick={() => setActiveTab('3D')} 
               className={`pb-4 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === '3D' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
             >
               3D Isometric
               {activeTab === '3D' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></span>}
             </button>
          </div>

          {activeTab === '2D' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Main Top View */}
              <div className="bg-gray-900 border border-white/5 rounded-[3rem] p-3 shadow-3xl overflow-hidden ring-1 ring-white/5 relative group">
                {topGrid ? (
                  <Heatmap 
                    grid={topGrid} 
                    threshold={Math.pow(10, params.logThreshold)} 
                    ledConfig={ledConfig} 
                    isFlashing={params.isFlashing}
                    contourLines={contourPathsTop}
                    viewType="top"
                    title="TOP VIEW (PLAN)"
                  />
                ) : (
                  <div className="w-full aspect-video flex flex-col items-center justify-center gap-6 text-gray-600 bg-gray-950 rounded-[2.5rem]">
                    <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                    <div className="font-black tracking-[0.3em] text-[10px] uppercase animate-pulse">Calculating Field Potentials...</div>
                  </div>
                )}
                
                {/* Overlay Export Button (Only on Top View) */}
                <div className="absolute bottom-10 left-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <button 
                    onClick={handleExportCAD}
                    disabled={contourPathsTop.length === 0}
                    className="bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group/btn shadow-2xl"
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover/btn:scale-110 transition-transform">
                        <i className="fas fa-file-export text-white"></i>
                    </div>
                    <div className="text-left">
                        <div className="text-[11px] font-black uppercase tracking-widest text-white">Export to CAD</div>
                        <div className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Vector DXF (Units: mm)</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Side View */}
              <div className="bg-gray-900 border border-white/5 rounded-[3rem] p-3 shadow-3xl overflow-hidden ring-1 ring-white/5 relative group">
                {sideGrid ? (
                  <Heatmap 
                    grid={sideGrid} 
                    threshold={Math.pow(10, params.logThreshold)} 
                    ledConfig={ledConfig} 
                    isFlashing={params.isFlashing}
                    contourLines={contourPathsSide}
                    viewType="side"
                    title="SIDE VIEW (ELEVATION)"
                  />
                ) : (
                  <div className="w-full aspect-video flex flex-col items-center justify-center gap-6 text-gray-600 bg-gray-950 rounded-[2.5rem]">
                    <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {activeTab === '3D' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <View3D 
                paths={slices3D} 
                isFlashing={params.isFlashing} 
                maxDist={params.gridLimits.maxY} 
                lateralSize={params.gridLimits.maxX}
              />
            </div>
          )}

          <div className="mt-8 flex items-center justify-between px-6 text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">
             <div className="flex items-center gap-3">
               <div className={`w-2 h-2 rounded-full ${isCalculating ? 'bg-amber-500 animate-pulse' : 'bg-indigo-500'}`}></div>
               <span>{isCalculating ? 'Engine Computing' : 'Field Converged'}</span>
             </div>
             <div className="flex gap-6">
               <span className="flex items-center gap-2">
                 <i className="fas fa-eye text-emerald-500/50"></i>
                 Composite Efficiency: {(effectiveEfficiency * 100).toFixed(1)}%
               </span>
               <span className="flex items-center gap-2">
                 <i className="fas fa-bullseye text-blue-500/50"></i>
                 Threshold: {Math.pow(10, params.logThreshold).toExponential(1)} lx
               </span>
               {params.isFlashing && (
                  <span className="flex items-center gap-2 text-emerald-500 animate-pulse">
                    <i className="fas fa-bolt"></i>
                    Temporal Gain: 8.0x
                  </span>
               )}
             </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
