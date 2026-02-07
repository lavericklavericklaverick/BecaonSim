
import { SCOTOPIC_DATA, PHOTOPIC_DATA, ALPHA } from './constants';
import { BeamPoint } from './types';

export const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) => {
  if (x0 === x1) return y0;
  return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
};

export const getLookupValue = (data: [number, number][], val: number): number => {
  if (val <= data[0][0]) return data[0][1];
  if (val >= data[data.length - 1][0]) return data[data.length - 1][1];
  
  for (let i = 0; i < data.length - 1; i++) {
    if (val >= data[i][0] && val <= data[i + 1][0]) {
      return lerp(val, data[i][0], data[i + 1][0], data[i][1], data[i + 1][1]);
    }
  }
  return 0;
};

export const getBeamIntensityDynamic = (beamPattern: BeamPoint[], angleDeg: number): number => {
  const absAngle = Math.abs(angleDeg);
  if (absAngle <= beamPattern[0].angle) return beamPattern[0].intensity;
  if (absAngle >= beamPattern[beamPattern.length - 1].angle) return beamPattern[beamPattern.length - 1].intensity;

  for (let i = 0; i < beamPattern.length - 1; i++) {
    if (absAngle >= beamPattern[i].angle && absAngle <= beamPattern[i + 1].angle) {
      return lerp(absAngle, beamPattern[i].angle, beamPattern[i + 1].angle, beamPattern[i].intensity, beamPattern[i + 1].intensity);
    }
  }
  return 0;
};

/**
 * Returns the effective visual efficiency for detection.
 * Uses the envelope (max) of Photopic and Scotopic curves.
 * This ensures red LEDs are visible at realistic distances (via cones)
 * while green/blue benefit from scotopic rod sensitivity.
 */
export const getEffectiveEfficiency = (wavelength: number) => {
  const scotopic = getLookupValue(SCOTOPIC_DATA, wavelength);
  const photopic = getLookupValue(PHOTOPIC_DATA, wavelength);
  return Math.max(scotopic, photopic);
};

export const calculateIlluminance = (
  x: number, 
  y: number, 
  z: number,
  angleH: number, 
  angleV: number,
  peakCandela: number, 
  effectiveEff: number,
  beamPattern: BeamPoint[]
): number => {
  const dist = Math.sqrt(x * x + y * y + z * z);
  if (dist < 1) return 0; // Avoid singularity at origin

  // LED direction vector in 3D
  // System: Y is Forward, X is Right, Z is Up
  // angleH (Yaw): rotation around Z axis (0 = +Y)
  // angleV (Pitch): rotation around X axis (0 = in XY plane)
  
  // Vector derivation:
  // Start D = (0, 1, 0)
  // Pitch by angleV around X: (0, cosV, sinV)
  // Yaw by angleH around Z:
  // x = 0*cosH - (cosV)*sinH  <-- Wait, convention.
  // Let's use standard spherical to Cartesian conversion adapted for Y-forward.
  
  // Projection on XZ plane?
  // Let's stick to simple composition which matches "Spread Angle" behavior
  // A 'spread' usually implies a rotation.
  
  // If we assume the array is planar or spherical cap:
  // Dx = sin(angleH) * cos(angleV)
  // Dy = cos(angleH) * cos(angleV)
  // Dz = sin(angleV)
  
  const dirX = Math.sin(angleH) * Math.cos(angleV);
  const dirY = Math.cos(angleH) * Math.cos(angleV);
  const dirZ = Math.sin(angleV);
  
  // Point vector
  const cosTheta = (x * dirX + y * dirY + z * dirZ) / dist;
  
  const thetaRad = Math.acos(Math.max(-1, Math.min(1, cosTheta)));
  const thetaDeg = (thetaRad * 180) / Math.PI;

  const beamFactor = getBeamIntensityDynamic(beamPattern, thetaDeg);
  if (beamFactor <= 0) return 0;

  const attenuation = Math.exp(-ALPHA * dist);
  const invSquare = 1 / (dist * dist);

  // peakCandela here is assumed to be the candela at peak spectral sensitivity
  return peakCandela * effectiveEff * beamFactor * attenuation * invSquare;
};
