
import { SCOTOPIC_DATA, PHOTOPIC_DATA, ALPHA } from './constants';
import { BeamPoint } from './types';

/**
 * LINEAR INTERPOLATION (Lerp)
 */
export const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) => {
  if (Math.abs(x1 - x0) < 1e-9) return y0;
  return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
};

/**
 * SPECTRAL EFFICIENCY LOOKUP
 * Interpolates CIE V(λ) or V'(λ) curves.
 */
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

/**
 * BEAM PATTERN SAMPLER
 * Returns relative intensity (0.0 - 1.0) for a given off-axis angle (degrees).
 */
export const getBeamIntensityDynamic = (beamPattern: BeamPoint[], angleDeg: number): number => {
  const absAngle = Math.abs(angleDeg);
  
  // 1. Center of beam
  if (absAngle <= beamPattern[0].angle) return beamPattern[0].intensity;
  
  // 2. Beyond defined pattern
  // STRICT CUTOFF: If the angle is beyond the last defined point, intensity is 0.
  const lastPoint = beamPattern[beamPattern.length - 1];
  if (absAngle > lastPoint.angle) {
      return 0.0; 
  }

  // 3. Interpolation
  for (let i = 0; i < beamPattern.length - 1; i++) {
    if (absAngle >= beamPattern[i].angle && absAngle <= beamPattern[i + 1].angle) {
      return lerp(absAngle, beamPattern[i].angle, beamPattern[i + 1].angle, beamPattern[i].intensity, beamPattern[i + 1].intensity);
    }
  }
  
  return 0.0;
};

/**
 * SPECTRAL CORRECTION (Purkinje Shift)
 */
export const getSpectralCorrectionFactor = (wavelength: number): number => {
  // For Infrared (> 700nm), we assume raw radiometric power logic is used
  // rather than photometric scaling. Returns 1.0 so intensity is treated as mW/sr directly.
  if (wavelength >= 700) {
      return 1.0;
  }

  const v_scotopic = getLookupValue(SCOTOPIC_DATA, wavelength);
  const v_photopic = getLookupValue(PHOTOPIC_DATA, wavelength);
  const v_photopic_safe = Math.max(v_photopic, 1e-6);
  const correction = 2.489 * (v_scotopic / v_photopic_safe);
  return Math.max(1.0, correction);
};

/**
 * ALLARD'S LAW (Point Source Illuminance)
 * Calculates E (Lux) at a point P(x,y,z).
 */
export const calculateIlluminance = (
  x: number, 
  y: number, 
  z: number,
  angleH: number, // Yaw
  angleV: number, // Pitch
  peakCandela: number, 
  spectralFactor: number, 
  beamPattern: BeamPoint[]
): number => {
  // 1. Distance Calculation
  const d2 = x*x + y*y + z*z;
  const dist = Math.sqrt(d2);
  
  // NEAR FIELD PROTECTION
  // We clamp the minimum distance to 5cm (0.05m).
  // Distances smaller than this are physically inside the lens/housing assembly
  // and cause inverse-square law singularities (Infinite Lux).
  const d_safe = Math.max(0.05, dist);

  // 2. Orientation Vectors
  // LED points along +Y in local space, rotated by H (Yaw around Z) and V (Pitch around X)
  // Direction Vector D:
  const Dx = Math.sin(angleH) * Math.cos(angleV);
  const Dy = Math.cos(angleH) * Math.cos(angleV);
  const Dz = Math.sin(angleV);

  // Vector to Point P (normalized using safe distance)
  const Px = x / d_safe;
  const Py = y / d_safe;
  const Pz = z / d_safe;

  // 3. Angle Calculation (Dot Product)
  const cosTheta = Dx*Px + Dy*Py + Dz*Pz;

  // STRICT BACKFACE CULLING
  // If cosTheta <= 0, the point is 90+ degrees off-axis.
  // This physically models the housing blocking light.
  if (cosTheta <= 0.001) return 0.0;

  const thetaRad = Math.acos(Math.min(1.0, cosTheta));
  const thetaDeg = thetaRad * (180 / Math.PI);

  // 4. Beam Pattern Lookup
  const relativeIntensity = getBeamIntensityDynamic(beamPattern, thetaDeg);
  
  // Optimization: Early exit if pattern returns 0 (e.g. angle > cutoff)
  if (relativeIntensity <= 0) return 0.0;

  // 5. Effective Intensity
  const I_effective = peakCandela * spectralFactor * relativeIntensity;

  // 6. Atmospheric Transmissivity (Allard's Law)
  const T = Math.exp(-ALPHA * d_safe);

  // 7. Final Illuminance
  return (I_effective * T) / (d_safe * d_safe);
};
