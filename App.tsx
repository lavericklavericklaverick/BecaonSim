
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { SimulationParams, GridData, ColorPreset, BeamPoint, Point, Point3D } from './types';
import { GRID_RES, COLOR_PRESETS, DEFAULT_BEAM_PATTERN, DEFAULT_GRID_LIMITS } from './constants';
import { getSpectralCorrectionFactor, calculateIlluminance } from './physics';
import { marchSquares } from './utils/marchSquares';
import { downloadDXF } from './utils/dxfExporter';
import Heatmap from './components/Heatmap';
import View3D from './components/View3D';
import Instructions from './components/Instructions';

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
  showMarkers?: boolean;
}

/**
 * Custom styled slider for simulation parameters
 */
const ControlSlider: React.FC<SliderProps> = ({ label, val, min, max, step, unit = "", onChange, color = "accent-indigo-500", showMarkers }) => (
  <div className="group">
    <label className="flex justify-between text-[11px] font-black text-gray-500 mb-3 uppercase tracking-wider group-hover:text-gray-300 transition-colors">
      <span>{label}</span>
      <span className="font-mono text-indigo-400 bg-indigo-500/10 px-2 rounded-md">
        {unit.includes("Log") ? `10^${val.toFixed(1)}` : val.toFixed(step < 1 ? 1 : 0)}
        {unit.replace("Log", "")}
      </span>
    </label>
    <input type="range" min={min} max={max} step={step} value={val} onChange={e => onChange(parseFloat(e.target.value))}
      className={`w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-white/10 transition-colors ${color}`} />

    {showMarkers && (
        <div className="flex justify-between mt-2 px-1 select-none">
            {Array.from({ length: Math.round((max - min) / step) + 1 }).map((_, i) => {
                const tickValue = min + i * step;
                const active = val === tickValue;
                return (
                    <div 
                        key={tickValue} 
                        onClick={() => onChange(tickValue)}
                        className="flex flex-col items-center cursor-pointer group/tick w-4"
                    >
                        <div className={`w-0.5 h-1.5 mb-1 rounded-full transition-colors ${active ? 'bg-indigo-500' : 'bg-white/10 group-hover/tick:bg-white/30'}`}></div>
                        <span className={`text-[9px] font-mono transition-colors ${active ? 'text-indigo-400 font-bold' : 'text-gray-600 group-hover/tick:text-gray-400'}`}>
                            {tickValue}
                        </span>
                    </div>
                );
            })}
        </div>
    )}
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
  vol: number; // Represents Coverage %
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
  const [showTarget, setShowTarget] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [showCones, setShowCones] = useState(false);

  const [topGrid, setTopGrid] = useState<GridData | null>(null);
  const [sideGrid, setSideGrid] = useState<GridData | null>(null);
  const [slices3D, setSlices3D] = useState<Point3D[][]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [activeTab, setActiveTab] = useState<'2D' | '3D' | 'HELP'>('2D');

  const isInfrared = useMemo(() => params.wavelength >= 800, [params.wavelength]);

  // --- PHYSICS ENGINE HOOKS ---
  // Calculates the boost factor for scotopic (night) vision based on wavelength.
  // Blue/Green light gets a significant boost (up to ~16x for deep blue) compared to Photopic Cd.
  // Returns 1.0 for Infrared.
  const spectralCorrection = useMemo(() => getSpectralCorrectionFactor(params.wavelength), [params.wavelength]);
  
  // Effective threshold calculation.
  // NOTE ON FLASHING:
  // We apply a Conspicuity Gain of 8x (0.9 log units) for flashing lights.
  const effectiveThreshold = useMemo(() => {
     // Always treat logThreshold as logarithmic (base 10).
     // For Visible: 10^x Lux.
     // For Infrared: 10^x W/m^2.
     const base = Math.pow(10, params.logThreshold);
     return params.isFlashing ? base / 8.0 : base;
  }, [params.isFlashing, params.logThreshold]);

  // Calculate full 3D configuration of LEDs {h, v}
  const ledConfig = useMemo(() => {
    return generateLedConfig(params.ledCount, params.spreadAngle, params.rowCount, params.verticalSpreadAngle);
  }, [params.ledCount, params.spreadAngle, params.rowCount, params.verticalSpreadAngle]);

  // Determine the intensity value to pass to the physics engine
  // IR: Input is mW/sr -> Convert to W/sr for physics (so output is W/m^2)
  // Vis: Input is cd -> Keep as cd (so output is Lux)
  const sourceIntensity = useMemo(() => {
      return isInfrared ? params.peakCandela / 1000 : params.peakCandela;
  }, [isInfrared, params.peakCandela]);

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
            total += calculateIlluminance(x, y, 0, cfg.h, cfg.v, sourceIntensity, spectralCorrection, params.beamPattern);
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
            total += calculateIlluminance(0, y, z, cfg.h, cfg.v, sourceIntensity, spectralCorrection, params.beamPattern);
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
      // Reduced SLICE RESOLUTION and COUNT for better visual aesthetics (less cluttered wireframe)
      const SLICE_RES = 151; 
      const NUM_SLICES = 24; // Lower count to prevent "wall of lines" look
      const slicePaths: Point3D[][] = [];
      // Use the effective threshold for contour generation
      const threshold = effectiveThreshold;

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
              total += calculateIlluminance(wx, wy, wz, cfg.h, cfg.v, sourceIntensity, spectralCorrection, params.beamPattern);
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
      sourceIntensity, 
      spectralCorrection, 
      params.beamPattern, 
      params.gridLimits, 
      effectiveThreshold
    ]);

  useEffect(() => {
    const timer = setTimeout(() => {
        runSimulation();
    }, 100);
    return () => clearTimeout(timer);
  }, [runSimulation]);

  // AUTO SCALING EFFECT
  useEffect(() => {
    if (!autoScale || !topGrid || !sideGrid || isCalculating) return;

    const threshold = effectiveThreshold;
    
    // Helper to find max extent in a grid
    const getExtent = (grid: GridData) => {
       let maxDim = 0;
       let maxRange = 0;
       for (let i = 0; i < grid.data.length; i++) {
          if (grid.data[i] >= threshold) {
             const gx = i % grid.width;
             const gy = Math.floor(i / grid.width);
             
             // Convert to world
             const wx = Math.abs(grid.minX + gx * ((grid.maxX - grid.minX) / (grid.width - 1)));
             const wy = grid.minY + gy * ((grid.maxY - grid.minY) / (grid.height - 1));
             
             if (wx > maxDim) maxDim = wx;
             if (wy > maxRange) maxRange = wy;
          }
       }
       return { maxDim, maxRange };
    };

    const topExt = getExtent(topGrid);
    const sideExt = getExtent(sideGrid);

    const neededLat = Math.max(topExt.maxDim, sideExt.maxDim); 
    const neededRange = Math.max(topExt.maxRange, sideExt.maxRange);

    if (neededLat === 0 || neededRange === 0) return; // No light detected

    const newMaxX = Math.ceil(neededLat * 1.3 / 100) * 100; // +30% padding
    const newMaxY = Math.ceil(neededRange * 1.2 / 100) * 100; // +20% padding

    // Only update if difference is significant to avoid loops (>10%)
    const diffX = Math.abs(newMaxX - params.gridLimits.maxX) / params.gridLimits.maxX;
    const diffY = Math.abs(newMaxY - params.gridLimits.maxY) / params.gridLimits.maxY;

    if (diffX > 0.1 || diffY > 0.1) {
       // Also ensure we don't zoom in to absurdly small levels
       // But if Infrared, we might need small levels. Let's adjust min clamp.
       const minClamp = isInfrared ? 10 : 200;
       const clampedX = Math.max(minClamp, newMaxX);
       const clampedY = Math.max(minClamp, newMaxY);

       if (Math.abs(clampedX - params.gridLimits.maxX) > (isInfrared ? 5 : 50) || Math.abs(clampedY - params.gridLimits.maxY) > (isInfrared ? 5 : 50)) {
           console.log("Auto-Scaling to:", clampedX, clampedY);
           setParams(prev => ({
             ...prev,
             gridLimits: {
               minX: -clampedX,
               maxX: clampedX,
               minY: 0,
               maxY: clampedY
             }
           }));
       }
    }

  }, [topGrid, sideGrid, autoScale, isCalculating, effectiveThreshold, params.gridLimits.maxX, params.gridLimits.maxY, isInfrared]);


  const contourPathsTop = useMemo(() => {
    if (!topGrid) return [];
    return marchSquares(topGrid, effectiveThreshold);
  }, [topGrid, effectiveThreshold]);

  const contourPathsSide = useMemo(() => {
    if (!sideGrid) return [];
    return marchSquares(sideGrid, effectiveThreshold);
  }, [sideGrid, effectiveThreshold]);

  const updateParam = <K extends keyof SimulationParams>(key: K, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const handlePresetSelect = (p: ColorPreset) => {
      const isSwitchingToIR = p.wavelength >= 800;
      const isSwitchingFromIR = params.wavelength >= 800 && p.wavelength < 800;

      if (isSwitchingToIR) {
          // Defaults for IR as requested
          setParams(prev => ({
              ...prev,
              wavelength: p.wavelength,
              peakCandela: 180, // mW/sr
              logThreshold: -9, // 1nW/m2
              gridLimits: {
                  minX: -5000, maxX: 5000, minY: 0, maxY: 10000 
              }
          }));
      } else if (isSwitchingFromIR) {
          // Reset to Visible Defaults
          setParams(prev => ({
              ...prev,
              wavelength: p.wavelength,
              peakCandela: 1.0, // cd
              logThreshold: -6, // log lx
              gridLimits: { ...DEFAULT_GRID_LIMITS }
          }));
      } else {
          updateParam('wavelength', p.wavelength);
      }
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
    setShowTarget(true); 
  };

  const handleOptimize = useCallback(async () => {
    setIsOptimizing(true);
    setOptResults([]);
    
    await new Promise(r => setTimeout(r, 50));

    const threshold = effectiveThreshold;
    const targetW = optTargets.width;
    const targetH = optTargets.height;
    const targetR = optTargets.range;

    const samples: Point3D[] = [];
    const stepX = 4; 
    const stepZ = 4; 
    const stepY = 8; 
    
    for(let i=0; i<=stepX; i++) {
        const x = (i/stepX) * (targetW/2);
        for(let k=0; k<=stepZ; k++) {
            const z = (k/stepZ) * (targetH/2);
            for(let j=1; j<=stepY; j++) {
                const y = (j/stepY) * targetR;
                samples.push({x, y, z});
            }
        }
    }
    const maxHits = samples.length;

    const findExtent = (
        cfg: {h:number, v:number}[], 
        startP: Point3D, 
        dir: Point3D, 
        maxDist: number
    ): number => {
        let low = 0;
        let high = maxDist;
        let limit = 0;
        
        for(let i=0; i<12; i++) { 
            const mid = (low + high) / 2;
            const x = startP.x + dir.x * mid;
            const y = startP.y + dir.y * mid;
            const z = startP.z + dir.z * mid;
            
            let total = 0;
            for (const c of cfg) {
                total += calculateIlluminance(x, y, z, c.h, c.v, sourceIntensity, spectralCorrection, params.beamPattern);
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
             
             let hits = 0;
             for(const p of samples) {
                 let total = 0;
                 for (const c of cfg) {
                    total += calculateIlluminance(p.x, p.y, p.z, c.h, c.v, sourceIntensity, spectralCorrection, params.beamPattern);
                 }
                 if (total >= threshold) hits++;
             }
             
             const coverage = (hits / maxHits) * 100;

             if (coverage > 2) { 
                 const range = findExtent(cfg, {x:0, y:0, z:0}, {x:0, y:1, z:0}, targetR * 2);
                 const halfWidth = findExtent(cfg, {x:0, y:range * 0.5, z:0}, {x:1, y:0, z:0}, targetW * 2);
                 const halfHeight = findExtent(cfg, {x:0, y:range * 0.5, z:0}, {x:0, y:0, z:1}, targetH * 2);

                 validResults.push({ 
                    h, v, 
                    vol: coverage, 
                    w: halfWidth * 2, 
                    hDim: halfHeight * 2, 
                    r: range 
                 });
             }
        }
    }
    
    validResults.sort((a, b) => b.vol - a.vol);
    setOptResults(validResults.slice(0, 100)); 
    setIsOptimizing(false);
    setShowTarget(true); 

  }, [params.ledCount, params.rowCount, sourceIntensity, params.beamPattern, spectralCorrection, effectiveThreshold, optTargets]);


  return (
    <div className="max-w-[1800px] mx-auto px-6 py-4 bg-gray-950 min-h-screen text-gray-200 selection:bg-indigo-500/30">
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <aside className="lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="bg-gray-900/50 border border-white/5 rounded-[2rem] p-4 shadow-2xl backdrop-blur-3xl space-y-2">
            
            <CollapsibleSection title="Optical Parameters" icon="fa-lightbulb" defaultOpen={true}>
              <div className="space-y-6 py-2">
                
                {/* DYNAMIC INTENSITY SLIDER */}
                {isInfrared ? (
                    <ControlSlider 
                        label="Radiant Intensity" 
                        val={params.peakCandela} 
                        unit=" mW/sr" 
                        min={0} max={1000} step={10} 
                        onChange={v => updateParam('peakCandela', v)} 
                        color="accent-rose-500"
                    />
                ) : (
                    <ControlSlider 
                        label="Peak Intensity" 
                        val={params.peakCandela} 
                        unit=" cd" 
                        min={0} max={5} step={0.1} 
                        onChange={v => updateParam('peakCandela', v)} 
                    />
                )}

                <ControlSlider label="Wavelength" val={params.wavelength} unit=" nm" min={380} max={950} step={5} onChange={v => updateParam('wavelength', v)} />
                
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
                    <button key={p.wavelength} onClick={() => handlePresetSelect(p)} 
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

            <CollapsibleSection title="Array Configuration" icon="fa-th" defaultOpen={true}>
              <div className="space-y-6 py-2">
                <div className="bg-white/5 rounded-xl p-3 mb-2">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-4">Plan (Horizontal)</span>
                    <ControlSlider label="LED Columns" val={params.ledCount} min={1} max={8} step={1} onChange={v => updateParam('ledCount', v)} showMarkers={true} />
                    <ControlSlider label="Plan Spread" val={params.spreadAngle} unit="°" min={0} max={90} step={1} onChange={v => updateParam('spreadAngle', v)} />
                </div>
                
                <div className="bg-white/5 rounded-xl p-3">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-4">Elevation (Vertical)</span>
                    <ControlSlider label="LED Rows" val={params.rowCount} min={1} max={8} step={1} onChange={v => updateParam('rowCount', v)} showMarkers={true} />
                    <ControlSlider label="Elev Spread" val={params.verticalSpreadAngle} unit="°" min={0} max={90} step={1} onChange={v => updateParam('verticalSpreadAngle', v)} />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Auto-Optimizer" icon="fa-magic" defaultOpen={false}>
              <div className="py-2 space-y-4">
                <p className="text-[10px] text-gray-500 leading-relaxed">
                   Maximizes volumetric coverage within the target dimensions.
                </p>
                <div className="grid grid-cols-3 gap-2">
                    <div className="bg-black/40 rounded-xl p-2 border border-white/5">
                        <label className="text-[8px] font-bold text-gray-400 uppercase block mb-1">Target Width</label>
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
                        <label className="text-[8px] font-bold text-gray-400 uppercase block mb-1">Target Height</label>
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
                        <label className="text-[8px] font-bold text-gray-400 uppercase block mb-1">Target Range</label>
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
                
                <div className="flex items-center justify-between">
                     <button 
                      onClick={handleOptimize}
                      disabled={isOptimizing}
                      className="flex-1 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
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
                    
                    <button 
                        onClick={() => setShowTarget(!showTarget)}
                        className={`ml-2 w-12 h-full rounded-xl flex items-center justify-center border transition-all ${showTarget ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' : 'bg-white/5 border-transparent text-gray-500 hover:text-white'}`}
                        title="Toggle Target Box"
                    >
                        <i className="fas fa-vector-square"></i>
                    </button>
                </div>
                
                {optResults.length > 0 ? (
                  <div className="mt-2 bg-black/40 rounded-xl border border-white/5 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-[10px] text-left border-collapse">
                      <thead className="sticky top-0 bg-gray-900 text-gray-400 font-bold uppercase tracking-wider shadow-sm z-10">
                        <tr>
                          <th className="p-3">Spread</th>
                          <th className="p-3">Range</th>
                          <th className="p-3">Coverage</th>
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
                             <td className="p-3 font-mono text-emerald-400 font-bold">{res.vol.toFixed(1)}%</td>
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
                      No efficient configurations found.
                   </div>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Detection Threshold" icon="fa-low-vision" defaultOpen={true}>
              <div className="py-2">
                 {/* DYNAMIC THRESHOLD SLIDER */}
                 {isInfrared ? (
                     <ControlSlider 
                        label="Irradiance Limit" 
                        val={params.logThreshold} 
                        min={-10} max={-2} step={0.1} 
                        unit="Log W/m²"
                        onChange={v => updateParam('logThreshold', v)} 
                        color="accent-rose-500" 
                     />
                 ) : (
                     <ControlSlider 
                        label="Illuminance Limit" 
                        val={params.logThreshold} 
                        min={-12} max={-2} step={0.1} 
                        unit="Log lx"
                        onChange={v => updateParam('logThreshold', v)} 
                        color="accent-emerald-500" 
                     />
                 )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="View Limits" icon="fa-expand-arrows-alt" defaultOpen={false}>
              <div className="space-y-6 py-2">
                <div className="flex items-center justify-between bg-black/20 p-2 rounded-lg mb-4 border border-white/5">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={autoScale} onChange={e => setAutoScale(e.target.checked)} className="accent-indigo-500 w-3 h-3" />
                      Auto-Scale View
                   </label>
                   {autoScale && <span className="text-[9px] text-indigo-400 animate-pulse">Active</span>}
                </div>
                
                <ControlSlider label="Lateral Range" val={params.gridLimits.maxX} unit="m" min={isInfrared ? 10 : 100} max={20000} step={isInfrared ? 10 : 100} onChange={v => {
                  updateGridLimit('maxX', v);
                  updateGridLimit('minX', -v);
                }} />
                <ControlSlider label="Forward Range" val={params.gridLimits.maxY} unit="m" min={isInfrared ? 10 : 100} max={20000} step={isInfrared ? 10 : 100} onChange={v => updateGridLimit('maxY', v)} />
              </div>
            </CollapsibleSection>
          </div>
        </aside>

        <main className="lg:col-span-8 xl:col-span-9 space-y-6">
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
             <button 
               onClick={() => setActiveTab('HELP')} 
               className={`pb-4 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'HELP' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
             >
               Instructions
               {activeTab === 'HELP' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>}
             </button>
          </div>

          {activeTab === '2D' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-gray-900 border border-white/5 rounded-[3rem] p-3 shadow-3xl overflow-hidden ring-1 ring-white/5 relative group">
                {topGrid ? (
                  <Heatmap 
                    grid={topGrid} 
                    threshold={effectiveThreshold} 
                    ledConfig={ledConfig} 
                    isFlashing={params.isFlashing}
                    contourLines={contourPathsTop}
                    viewType="top"
                    title="TOP VIEW (PLAN)"
                    targetBox={showTarget ? optTargets : undefined}
                  />
                ) : (
                  <div className="w-full aspect-video flex flex-col items-center justify-center gap-6 text-gray-600 bg-gray-950 rounded-[2.5rem]">
                    <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                    <div className="font-black tracking-[0.3em] text-[10px] uppercase animate-pulse">Calculating Field Potentials...</div>
                  </div>
                )}
                
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

              <div className="bg-gray-900 border border-white/5 rounded-[3rem] p-3 shadow-3xl overflow-hidden ring-1 ring-white/5 relative group">
                {sideGrid ? (
                  <Heatmap 
                    grid={sideGrid} 
                    threshold={effectiveThreshold} 
                    ledConfig={ledConfig} 
                    isFlashing={params.isFlashing}
                    contourLines={contourPathsSide}
                    viewType="side"
                    title="SIDE VIEW (ELEVATION)"
                    targetBox={showTarget ? optTargets : undefined}
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
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
              <View3D 
                paths={slices3D} 
                isFlashing={params.isFlashing} 
                maxDist={params.gridLimits.maxY} 
                lateralSize={params.gridLimits.maxX}
                targetBox={showTarget ? optTargets : undefined}
                showCones={showCones}
                ledConfig={ledConfig}
                beamPattern={params.beamPattern}
                wavelength={params.wavelength}
                peakCandela={sourceIntensity}
                effectiveEfficiency={spectralCorrection}
                threshold={effectiveThreshold}
              />
              <div className="absolute top-6 right-8 z-20">
                <button 
                  onClick={() => setShowCones(!showCones)}
                  className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${showCones ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400' : 'bg-black/40 border-white/10 text-gray-500 hover:text-white'}`}
                >
                  <i className={`fas ${showCones ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                  {showCones ? 'Light Cones ON' : 'Light Cones OFF'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'HELP' && <Instructions />}

          <div className="mt-8 flex items-center justify-between px-6 text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">
             <div className="flex items-center gap-3">
               <div className={`w-2 h-2 rounded-full ${isCalculating ? 'bg-amber-500 animate-pulse' : 'bg-indigo-500'}`}></div>
               <span>{isCalculating ? 'Engine Computing' : 'Field Converged'}</span>
             </div>
             <div className="flex gap-6">
               <span className="flex items-center gap-2">
                 <i className="fas fa-eye text-emerald-500/50"></i>
                 {isInfrared ? 'Correction: None (Radiometric)' : `Spectral Factor: ${spectralCorrection.toFixed(2)}x`}
               </span>
               <span className="flex items-center gap-2">
                 <i className="fas fa-bullseye text-blue-500/50"></i>
                 Eff. Threshold: {effectiveThreshold.toExponential(2)} {isInfrared ? 'W/m²' : 'lx'}
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
