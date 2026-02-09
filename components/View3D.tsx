import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Line, Stars, Text, Box, Plane } from '@react-three/drei';
import * as THREE from 'three';
import { Point3D, BeamPoint, ColorPreset } from '../types';
import { COLOR_PRESETS, ALPHA } from '../constants';
import { getBeamIntensityDynamic } from '../physics';

// Dual declaration to fix missing JSX types in various environments (React 18+, global vs module JSX)
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      shaderMaterial: any;
      lineSegments: any;
      edgesGeometry: any;
      lineBasicMaterial: any;
      planeGeometry: any;
      meshBasicMaterial: any;
      color: any;
      fog: any;
      ambientLight: any;
      pointLight: any;
      axesHelper: any;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      shaderMaterial: any;
      lineSegments: any;
      edgesGeometry: any;
      lineBasicMaterial: any;
      planeGeometry: any;
      meshBasicMaterial: any;
      color: any;
      fog: any;
      ambientLight: any;
      pointLight: any;
      axesHelper: any;
    }
  }
}

interface View3DProps {
  paths: Point3D[][];
  isFlashing: boolean;
  maxDist: number;
  lateralSize?: number;
  targetBox?: { width: number; height: number; range: number };
  showCones?: boolean;
  ledConfig?: { h: number; v: number }[];
  beamPattern?: BeamPoint[];
  wavelength?: number;
  peakCandela?: number;
  effectiveEfficiency?: number; // Now represents Spectral Correction Factor
  threshold?: number;
}

const LineSegment: React.FC<{ path: Point3D[]; color: string }> = ({ path, color }) => {
  const points = useMemo(() => {
    return path.map(p => new THREE.Vector3(p.x, p.z, -p.y)); // Sim(x,y,z) -> Three(x,y,z): X=Lat, Y=Height, -Z=Dist
  }, [path]);

  if (points.length < 2) return null;

  return (
    <Line 
      points={points} 
      color={color} 
      lineWidth={1} 
      transparent 
      opacity={0.3} // Subtle transparency to avoid clutter
      toneMapped={false} 
    />
  );
};

const ThresholdLines: React.FC<{ paths: Point3D[][]; color: string }> = React.memo(({ paths, color }) => {
  return (
    <group>
      {paths.map((path, i) => (
        <LineSegment key={i} path={path} color={color} />
      ))}
    </group>
  );
});

// Simplified Shader for Flat 40% Opacity
const beamMaterialShader = {
  vertexShader: `
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 color;
    uniform float opacity;
    void main() {
      gl_FragColor = vec4(color, opacity);
    }
  `
};

/**
 * Visualizes the volumetric radiation pattern (Lobe) for a single LED.
 * Uses a LatheGeometry.
 */
const SingleLEDCone: React.FC<{ 
    h: number; 
    v: number; 
    beamPattern: BeamPoint[]; 
    color: string; 
    maxDist: number;
    peakCandela: number;
    effectiveEfficiency: number;
    threshold: number;
}> = ({ h, v, beamPattern, color, maxDist, peakCandela, effectiveEfficiency, threshold }) => {
    
    const { geometry } = useMemo(() => {
        const pts: THREE.Vector2[] = [];
        
        if (peakCandela <= 0 || effectiveEfficiency <= 0 || threshold <= 0) {
            return { geometry: new THREE.BufferGeometry() };
        }

        const maxAngle = Math.max(90, beamPattern[beamPattern.length - 1].angle);
        const step = 2; 

        // Generate Geometry Profile
        for (let a = 0; a <= maxAngle; a += step) {
             const intensityFactor = getBeamIntensityDynamic(beamPattern, a);
             
             // I = Peak * SpectralCorrection * ProfileFactor
             const I = peakCandela * effectiveEfficiency * intensityFactor;
             
             // Solve d^2 * exp(ALPHA * d) = I / Threshold
             let d = 0;
             const K = I / threshold;

             if (K > 1e-6) {
                 // Binary Search for d
                 let low = 0;
                 let high = Math.min(50000, Math.sqrt(K)); // Approx limit
                 
                 for(let i=0; i<15; i++) {
                     const mid = (low + high) * 0.5;
                     const val = mid * mid * Math.exp(ALPHA * mid);
                     if (val < K) low = mid;
                     else high = mid;
                 }
                 d = high;
             }

             // Lathe rotates around Y. 
             // We define profile in XY. Y is Axis. X is Radius.
             const rad = (a * Math.PI) / 180;
             const radius = d * Math.sin(rad);
             const height = d * Math.cos(rad);
             
             pts.push(new THREE.Vector2(radius, height));

             // If distance drops to near zero, we close the shape
             if (d < 0.05 && a > 0) break;
        }

        // Ensure closure at the base if needed
        const last = pts[pts.length - 1];
        if (last.x > 0.1 || last.y > 0.1) {
            pts.push(new THREE.Vector2(0, 0));
        }

        const segments = 72; // Increased segments for smoother roundness
        const geom = new THREE.LatheGeometry(pts, segments);
        geom.computeBoundingSphere(); // Ensure bounding sphere is calculated
        
        return { geometry: geom };
    }, [beamPattern, peakCandela, effectiveEfficiency, threshold]);

    const uniforms = useMemo(() => ({
        color: { value: new THREE.Color(color) },
        opacity: { value: 0.4 } // Flat 40% opacity as requested
    }), [color]);

    return (
        <group rotation={[v, -h, 0]}>
            <mesh 
                rotation={[-Math.PI / 2, 0, 0]} 
                geometry={geometry} 
                frustumCulled={false} // Prevent disappearing at certain angles
            >
                <shaderMaterial 
                    vertexShader={beamMaterialShader.vertexShader}
                    fragmentShader={beamMaterialShader.fragmentShader}
                    uniforms={uniforms}
                    transparent={true}
                    side={THREE.DoubleSide}
                    depthWrite={false} // Important for transparent overlapping meshes
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
            {/* Center Ray for visual reference */}
            <Line 
              points={[new THREE.Vector3(0,0,0), new THREE.Vector3(0,0, -maxDist * 0.1)]}
              color={color}
              lineWidth={1}
              transparent
              opacity={0.3}
            />
        </group>
    );
};

const LEDCones: React.FC<{ 
    config: { h: number; v: number }[]; 
    beamPattern: BeamPoint[]; 
    color: string; 
    maxDist: number;
    peakCandela?: number;
    effectiveEfficiency?: number;
    threshold?: number;
}> = ({ config, beamPattern, color, maxDist, peakCandela, effectiveEfficiency, threshold }) => {
    
    if (peakCandela === undefined || effectiveEfficiency === undefined || threshold === undefined) return null;

    return (
        <group>
            {config.map((cfg, i) => (
                <SingleLEDCone 
                  key={i} 
                  h={cfg.h} 
                  v={cfg.v} 
                  beamPattern={beamPattern} 
                  color={color} 
                  maxDist={maxDist} 
                  peakCandela={peakCandela}
                  effectiveEfficiency={effectiveEfficiency}
                  threshold={threshold}
                />
            ))}
        </group>
    );
};

const TargetBox: React.FC<{ width: number; height: number; range: number }> = ({ width, height, range }) => {
  return (
    <group position={[0, 0, -range / 2]}>
        <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width, height, range)]} />
            <lineBasicMaterial color="#facc15" transparent opacity={0.6} />
        </lineSegments>
        <Text position={[0, height/2 + 50, 0]} fontSize={100} color="#facc15" anchorX="center" anchorY="bottom">
            TARGET
        </Text>
    </group>
  );
};

const MetricScale: React.FC<{ maxDist: number; floorY: number }> = ({ maxDist, floorY }) => {
    const ticks = useMemo(() => {
        const items = [];
        // Adaptive Step Calculation for small scales (e.g. 20m) vs large scales (20000m)
        let step = Math.pow(10, Math.floor(Math.log10(maxDist)));
        if (maxDist / step < 2) step /= 5;
        else if (maxDist / step < 5) step /= 2;

        const textHeight = floorY + (maxDist * 0.02); 

        for (let i = 0; i <= maxDist; i += step) {
            items.push(
                <group key={`dist-${i}`} position={[maxDist * 0.1, textHeight, -i]}>
                    <mesh position={[-maxDist * 0.05, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[maxDist * 0.08, maxDist * 0.02]} />
                        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} side={THREE.DoubleSide} />
                    </mesh>
                    <Text
                        position={[0, 0, 0]}
                        rotation={[-Math.PI / 2, 0, 0]}
                        fontSize={maxDist * 0.04}
                        color="white"
                        fillOpacity={0.8}
                        anchorX="left"
                        anchorY="middle"
                        outlineWidth={maxDist * 0.002}
                        outlineColor="#000000"
                    >
                        {i}m
                    </Text>
                </group>
            );
        }
        return items;
    }, [maxDist, floorY]);

    return <group>{ticks}</group>;
};

const View3D: React.FC<View3DProps> = ({ paths, isFlashing, maxDist, lateralSize = 2000, targetBox, showCones, ledConfig, beamPattern, wavelength, peakCandela, effectiveEfficiency, threshold }) => {
  const lineColor = isFlashing ? '#34d399' : '#4ade80';
  
  const ledColor = useMemo(() => {
      const preset = COLOR_PRESETS.find(p => p.wavelength === wavelength);
      return preset ? preset.hex : '#ffffff';
  }, [wavelength]);

  // Adjust floorY relative to scale to avoid text collision
  const floorY = -maxDist * 0.01; 
  const gridArgs: [number, number] = useMemo(() => [maxDist * 2, maxDist * 2], [maxDist]);
  const targetTuple: [number, number, number] = useMemo(() => [0, 0, -maxDist / 3], [maxDist]);

  return (
    <div className="w-full h-[600px] lg:h-[750px] bg-gray-950 rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl relative">
      <div className="absolute top-6 left-8 z-10 pointer-events-none">
          <h2 className="text-white text-xl font-black tracking-tight">ISOMETRIC VISUALIZER</h2>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">3D Volumetric Threshold Net</p>
      </div>

      <Canvas camera={{ position: [maxDist * 0.8, maxDist * 0.8, maxDist * 0.8], fov: 45, far: maxDist * 10 }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
      >
        <color attach="background" args={['#050505']} />
        <fog attach="fog" args={['#050505', maxDist, maxDist * 8]} />
        
        <ambientLight intensity={0.5} />
        <pointLight position={[1000, 1000, 1000]} intensity={1} />
        
        <Stars radius={maxDist * 4} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />

        <group position={[0, 0, 0]}>
           <ThresholdLines paths={paths} color={lineColor} />
           
           {showCones && ledConfig && beamPattern && (
               <LEDCones 
                 config={ledConfig} 
                 beamPattern={beamPattern} 
                 color={ledColor} 
                 maxDist={maxDist} 
                 peakCandela={peakCandela}
                 effectiveEfficiency={effectiveEfficiency}
                 threshold={threshold}
               />
           )}
           
           {/* BACKPLANE VISUALIZATION (Mounting Surface) */}
           {/* Visualizes the plane at Distance = 0 to confirm no light leakage behind */}
           <mesh position={[0, 0, 0]} rotation={[0, 0, 0]}>
               <planeGeometry args={[maxDist, maxDist]} />
               <meshBasicMaterial color="#1e1e1e" transparent opacity={0.2} side={THREE.DoubleSide} />
           </mesh>
           <Grid 
                position={[0, 0, 0]} 
                rotation={[Math.PI/2, 0, 0]}
                args={[maxDist, maxDist]} 
                cellSize={maxDist / 20} 
                sectionSize={maxDist / 4} 
                sectionColor="#334155" 
                cellColor="#1e293b" 
                fadeDistance={maxDist}
           />

           {targetBox && <TargetBox {...targetBox} />}
           
           <MetricScale maxDist={maxDist} floorY={floorY} />

           <Grid 
            position={[0, floorY - (maxDist * 0.005), 0]} 
            args={gridArgs} 
            cellSize={maxDist / 4} 
            sectionSize={maxDist / 2} 
            fadeDistance={maxDist * 2} 
            sectionColor="#4f46e5" 
            cellColor="#1e293b" 
            infiniteGrid
          />
          
          <axesHelper args={[maxDist / 2]} position={[0, floorY, 0]} />
        </group>

        <OrbitControls 
            makeDefault 
            minDistance={maxDist * 0.1} 
            maxDistance={maxDist * 6} 
            target={targetTuple}
            autoRotate={false} 
            dampingFactor={0.05}
        />
      </Canvas>
    </div>
  );
};

export default View3D;