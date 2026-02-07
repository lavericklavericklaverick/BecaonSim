
export interface BeamPoint {
  angle: number;
  intensity: number;
}

export interface GridLimits {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface SimulationParams {
  ledCount: number;      // Horizontal columns
  spreadAngle: number;   // Horizontal spread
  rowCount: number;      // Vertical rows (NEW)
  verticalSpreadAngle: number; // Vertical spread (NEW)
  peakCandela: number;
  wavelength: number;
  logThreshold: number;
  isFlashing: boolean;
  beamPattern: BeamPoint[];
  gridLimits: GridLimits;
}

export interface ColorPreset {
  name: string;
  wavelength: number;
  hex: string;
}

export interface GridData {
  data: Float32Array;
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}
