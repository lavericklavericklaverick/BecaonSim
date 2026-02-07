
import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Line, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Point3D } from '../types';

interface View3DProps {
  paths: Point3D[][];
  isFlashing: boolean;
  maxDist: number;
  lateralSize?: number;
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
      lineWidth={1.5} // Thinner lines for high-res feel
      transparent 
      opacity={0.6}
      toneMapped={false} // Brighter, glowing colors
    />
  );
};

const ThresholdLines: React.FC<{ paths: Point3D[][]; color: string }> = ({ paths, color }) => {
  return (
    <group>
      {paths.map((path, i) => (
        <LineSegment key={i} path={path} color={color} />
      ))}
    </group>
  );
};

const MetricScale: React.FC<{ maxDist: number; floorY: number }> = ({ maxDist, floorY }) => {
    const ticks = useMemo(() => {
        const items = [];
        const step = maxDist > 5000 ? 2000 : 1000;
        
        // Forward Scale (Distance) along -Z axis
        for (let i = 0; i <= maxDist; i += step) {
            items.push(
                <group key={`dist-${i}`} position={[maxDist * 0.1, floorY, -i]}>
                    <mesh position={[-maxDist * 0.05, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[maxDist * 0.08, maxDist * 0.01]} />
                        <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
                    </mesh>
                    <Text
                        position={[0, 0, 0]}
                        rotation={[-Math.PI / 2, 0, 0]}
                        fontSize={maxDist * 0.04}
                        color="white"
                        fillOpacity={0.5}
                        anchorX="left"
                        anchorY="middle"
                    >
                        {i}m
                    </Text>
                </group>
            );
        }
        
        // Lateral Scale (Width) along X axis
        const latStep = step;
        const maxLat = maxDist; // Assuming roughly square for grid purposes
        for (let i = -maxLat; i <= maxLat; i += latStep) {
            if (i === 0) continue; // Skip 0 as it overlaps
            items.push(
                <group key={`lat-${i}`} position={[i, floorY, maxDist * 0.1]}>
                    <mesh position={[0, 0, -maxDist * 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
                         <planeGeometry args={[maxDist * 0.01, maxDist * 0.08]} />
                         <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
                    </mesh>
                    <Text
                        position={[0, 0, 0]}
                        rotation={[-Math.PI / 2, 0, 0]}
                        fontSize={maxDist * 0.04}
                        color="white"
                        fillOpacity={0.5}
                        anchorX="center"
                        anchorY="top"
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

const View3D: React.FC<View3DProps> = ({ paths, isFlashing, maxDist, lateralSize = 2000 }) => {
  const lineColor = isFlashing ? '#34d399' : '#4ade80';

  // Position grid at the center of the simulation bounding box (Y=0)
  const floorY = 0;

  // Grid size matches the simulation domain
  const gridArgs: [number, number] = useMemo(() => [maxDist * 2, maxDist * 2], [maxDist]);
  
  // Calculate camera target to be in the middle of the beam path
  // Beam goes from 0 to -maxDist in ThreeJS Z
  const targetTuple: [number, number, number] = useMemo(() => [0, 0, -maxDist / 3], [maxDist]);

  return (
    <div className="w-full h-[600px] lg:h-[750px] bg-gray-950 rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl relative">
      <div className="absolute top-6 left-8 z-10 pointer-events-none">
          <h2 className="text-white text-xl font-black tracking-tight">ISOMETRIC VISUALIZER</h2>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">3D Volumetric Threshold Net</p>
      </div>

      <div className="absolute bottom-6 right-8 z-10 pointer-events-none text-right">
          <div className="flex items-center justify-end gap-2 text-[10px] text-gray-500 font-mono">
            <span className="w-3 h-0.5 bg-red-500"></span> X: Lateral
          </div>
          <div className="flex items-center justify-end gap-2 text-[10px] text-gray-500 font-mono">
             <span className="w-3 h-0.5 bg-green-500"></span> Y: Height (Up)
          </div>
          <div className="flex items-center justify-end gap-2 text-[10px] text-gray-500 font-mono">
             <span className="w-3 h-0.5 bg-blue-500"></span> Z: Distance (Fwd)
          </div>
      </div>
      
      <Canvas camera={{ position: [maxDist * 0.8, maxDist * 0.8, maxDist * 0.8], fov: 45, far: maxDist * 5 }}>
        <color attach="background" args={['#050505']} />
        <fog attach="fog" args={['#050505', maxDist, maxDist * 4]} />
        
        <ambientLight intensity={0.5} />
        <pointLight position={[1000, 1000, 1000]} intensity={1} />
        <pointLight position={[-1000, 500, -1000]} intensity={0.5} />
        
        {/* Subtle star background for depth */}
        <Stars radius={maxDist * 2} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />

        <group position={[0, 0, 0]}>
           {/* Lines */}
           <ThresholdLines paths={paths} color={lineColor} />
           
           <MetricScale maxDist={maxDist} floorY={floorY} />

           {/* Reference Grid at Center */}
           <Grid 
            position={[0, floorY, 0]} 
            args={gridArgs} 
            cellSize={500} 
            sectionSize={1000} 
            fadeDistance={maxDist * 2} 
            sectionColor="#4f46e5" 
            cellColor="#1e293b" 
            infiniteGrid
          />
          
          <axesHelper args={[500]} />
        </group>

        <OrbitControls 
            makeDefault 
            minDistance={100} 
            maxDistance={maxDist * 4} 
            target={targetTuple}
            autoRotate
            autoRotateSpeed={0.5}
        />
      </Canvas>
    </div>
  );
};

export default View3D;
