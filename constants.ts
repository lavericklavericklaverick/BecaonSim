
import { ColorPreset, BeamPoint, GridLimits } from './types';

export const ALPHA = 0.00015; // atmospheric attenuation coefficient m^-1

/**
 * CIE 1951 Scotopic Luminous Efficiency V'(λ) - Rods
 */
export const SCOTOPIC_DATA: [number, number][] = [
  [380, 0.000589], [400, 0.00929], [420, 0.0966], [440, 0.3281],
  [460, 0.647], [480, 0.909], [500, 0.982], [507, 1.000],
  [520, 0.935], [540, 0.650], [560, 0.3288], [580, 0.1212],
  [600, 0.03315], [620, 0.00737], [640, 0.001497], [660, 0.0003129],
  [680, 0.0000715], [700, 0.0000178]
];

/**
 * CIE 1924 Photopic Luminous Efficiency V(λ) - Cones
 */
export const PHOTOPIC_DATA: [number, number][] = [
  [380, 0.000039], [400, 0.000396], [420, 0.004000], [440, 0.023000],
  [460, 0.060000], [480, 0.139020], [500, 0.323000], [520, 0.710000],
  [540, 0.954000], [555, 1.000000], [560, 0.995000], [580, 0.870000],
  [600, 0.631000], [620, 0.381000], [640, 0.175000], [660, 0.061000],
  [680, 0.017000], [700, 0.004102]
];

export const DEFAULT_BEAM_PATTERN: BeamPoint[] = [
  { angle: 0, intensity: 1.0 },
  { angle: 10, intensity: 0.9 },
  { angle: 20, intensity: 0.45 },
  { angle: 30, intensity: 0.0 }
];

export const DEFAULT_GRID_LIMITS: GridLimits = {
  minX: -2000,
  maxX: 2000,
  minY: 0,
  maxY: 2000
};

export const COLOR_PRESETS: ColorPreset[] = [
  { name: 'Deep Blue', wavelength: 450, hex: '#0000FF' },
  { name: 'Blue', wavelength: 470, hex: '#0080FF' },
  { name: 'Cyan', wavelength: 495, hex: '#00FFFF' },
  { name: 'Green', wavelength: 525, hex: '#00FF00' },
  { name: 'Yellow-Green', wavelength: 565, hex: '#9ACD32' },
  { name: 'Yellow', wavelength: 585, hex: '#FFFF00' },
  { name: 'Amber', wavelength: 595, hex: '#FFBF00' },
  { name: 'Red-Orange', wavelength: 610, hex: '#FF4500' },
  { name: 'Red', wavelength: 625, hex: '#FF0000' },
  { name: 'Deep Red', wavelength: 660, hex: '#8B0000' },
  { name: 'Infrared', wavelength: 850, hex: '#be123c' }
];

export const GRID_RES = 450;
