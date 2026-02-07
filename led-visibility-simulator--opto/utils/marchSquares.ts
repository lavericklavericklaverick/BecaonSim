
import { GridData, Point } from '../types';

/**
 * Calculates a point between two values based on a threshold (Linear Interpolation).
 */
const interpolate = (val1: number, val2: number, out1: number, out2: number, threshold: number): number => {
  if (Math.abs(val2 - val1) < 1e-9) return (out1 + out2) / 2;
  return out1 + (out2 - out1) * ((threshold - val1) / (val2 - val1));
};

/**
 * Marching Squares with Topological Graph Stitching and Chaikin Smoothing.
 * 
 * 1. Identifies grid edges where the surface crosses the threshold.
 * 2. Builds an adjacency graph of these edge intersections.
 * 3. Traverses the graph to form continuous polylines.
 * 4. Applies Chaikin smoothing for high-quality vector output.
 */
export const marchSquares = (grid: GridData, threshold: number): Point[][] => {
  const { data, width, height, minX, maxX, minY, maxY } = grid;
  
  // Coordinate mappers
  const getX = (gx: number) => minX + gx * ((maxX - minX) / (width - 1));
  const getY = (gy: number) => minY + gy * ((maxY - minY) / (height - 1));
  
  // Value lookup
  const getVal = (gx: number, gy: number) => data[gy * width + gx];

  // Graph Data Structures
  // Nodes are identified by a string Key representing a specific grid edge.
  // H:x:y -> Horizontal edge between (x,y) and (x+1,y)
  // V:x:y -> Vertical edge between (x,y) and (x,y+1)
  const edgeNodes = new Map<string, Point>();
  const adj = new Map<string, string[]>();

  const getEdgeKey = (type: 'H' | 'V', x: number, y: number) => `${type}:${x}:${y}`;

  const addNode = (key: string, p: Point) => {
    if (!edgeNodes.has(key)) edgeNodes.set(key, p);
  };

  const addConnection = (k1: string, k2: string) => {
    if (!adj.has(k1)) adj.set(k1, []);
    if (!adj.has(k2)) adj.set(k2, []);
    adj.get(k1)!.push(k2);
    adj.get(k2)!.push(k1);
  };

  // 1. Build the Graph
  for (let gy = 0; gy < height - 1; gy++) {
    for (let gx = 0; gx < width - 1; gx++) {
      // Corner values
      const vTL = getVal(gx, gy);
      const vTR = getVal(gx + 1, gy);
      const vBR = getVal(gx + 1, gy + 1);
      const vBL = getVal(gx, gy + 1);

      // Binary configuration
      let config = 0;
      if (vTL >= threshold) config |= 8;
      if (vTR >= threshold) config |= 4;
      if (vBR >= threshold) config |= 2;
      if (vBL >= threshold) config |= 1;

      if (config === 0 || config === 15) continue;

      // Calculate intersection points for relevant edges
      // Top Edge (between TL and TR)
      const kTop = getEdgeKey('H', gx, gy);
      if ((config & 8) !== (config & 4)) { // active if bits differ
        const tx = interpolate(vTL, vTR, getX(gx), getX(gx + 1), threshold);
        addNode(kTop, { x: tx, y: getY(gy) });
      }

      // Right Edge (between TR and BR)
      const kRight = getEdgeKey('V', gx + 1, gy);
      if ((config & 4) !== (config & 2)) {
        const ty = interpolate(vTR, vBR, getY(gy), getY(gy + 1), threshold);
        addNode(kRight, { x: getX(gx + 1), y: ty });
      }

      // Bottom Edge (between BL and BR)
      const kBottom = getEdgeKey('H', gx, gy + 1);
      if ((config & 1) !== (config & 2)) {
        const tx = interpolate(vBL, vBR, getX(gx), getX(gx + 1), threshold);
        addNode(kBottom, { x: tx, y: getY(gy + 1) });
      }

      // Left Edge (between TL and BL)
      const kLeft = getEdgeKey('V', gx, gy);
      if ((config & 8) !== (config & 1)) {
        const ty = interpolate(vTL, vBL, getY(gy), getY(gy + 1), threshold);
        addNode(kLeft, { x: getX(gx), y: ty });
      }

      // Connect Edges based on Config
      switch (config) {
        case 1:  addConnection(kLeft, kBottom); break; // BL
        case 2:  addConnection(kBottom, kRight); break; // BR
        case 3:  addConnection(kLeft, kRight); break;  // BL & BR (Horizontal stripe)
        case 4:  addConnection(kTop, kRight); break;   // TR
        case 5:  // Saddle: TL & BR. Ambiguous. Connect TL-Top to TL-Left, and BR-Bottom to BR-Right
                 addConnection(kTop, kLeft);
                 addConnection(kBottom, kRight);
                 break;
        case 6:  addConnection(kTop, kBottom); break;  // TR & BR (Vertical stripe)
        case 7:  addConnection(kTop, kLeft); break;    // Except TL
        case 8:  addConnection(kLeft, kTop); break;    // TL
        case 9:  addConnection(kTop, kBottom); break;  // TL & BR (Vertical stripe, ambiguous resolved)
        case 10: // Saddle: TR & BL.
                 addConnection(kTop, kRight);
                 addConnection(kLeft, kBottom);
                 break;
        case 11: addConnection(kTop, kRight); break;   // Except TR
        case 12: addConnection(kLeft, kRight); break;  // TL & TR (Horizontal stripe)
        case 13: addConnection(kBottom, kRight); break; // Except BR
        case 14: addConnection(kLeft, kBottom); break; // Except BL
      }
    }
  }

  // 2. Traverse Graph to Extract Paths
  const visited = new Set<string>();
  const paths: Point[][] = [];

  // Iterate over all nodes in adj to find start points
  for (const startKey of adj.keys()) {
    if (visited.has(startKey)) continue;

    // We need to determine if this is a start of an open line or part of a loop.
    // Open line endpoints have degree 1. Loops have degree 2.
    // If we find a degree 1 node, it's a definite start.
    // If all are degree 2, pick any unvisited as start (it's a loop).
    
    // However, simply iterating keys might pick a middle node.
    // Better strategy: Collect all components first?
    // Optimization: Just greedy walk.
    
    // If it's degree 1, start here. If degree 2, wait unless we assume it's a loop.
    const neighbors = adj.get(startKey)!;
    if (neighbors.length === 2 && !visited.has(startKey)) {
        // It's a middle or loop point.
        // Check if there is a 'better' start point (degree 1) in this component?
        // Actually, we can just walk one direction, then reverse and walk other.
    }
  }
  
  // Revised Traversal:
  // 1. Find all endpoints (degree 1) and trace them.
  // 2. Then trace any remaining unvisited nodes (loops).

  const trace = (start: string) => {
    const path: Point[] = [];
    let curr: string | undefined = start;
    
    // If we start at degree 1, we just walk until the other end.
    // If we start at degree 2 (loop), we walk until we hit start again.
    
    while (curr && !visited.has(curr)) {
      visited.add(curr);
      path.push(edgeNodes.get(curr)!);
      
      const n: string[] = adj.get(curr) || [];
      // Find unvisited neighbor
      curr = n.find(k => !visited.has(k));
    }
    
    // If we started at a degree 2 node and it was a loop, the loop closes when we hit 'start' again.
    // Check if the last point connects to start
    const lastKey = [...adj.keys()].find(k => edgeNodes.get(k) === path[path.length-1]); // This reverse lookup is hard.
    // Actually, 'curr' became undefined because we hit visited.
    // If it was a loop, the last processed node has 'start' as a neighbor.
    
    return path;
  };

  // Separate keys by degree
  const endpoints: string[] = [];
  const midpoints: string[] = [];
  for (const [key, n] of adj) {
    if (n.length === 1) endpoints.push(key);
    else midpoints.push(key);
  }

  // Trace open paths
  for (const k of endpoints) {
    if (!visited.has(k)) {
      paths.push(trace(k));
    }
  }

  // Trace loops
  for (const k of midpoints) {
    if (!visited.has(k)) {
      const path = trace(k);
      // Close the loop visually
      if (path.length > 2) {
        // Check if the last node connects to the first node in the graph
        // (Since our trace stops when visited, we implicitly closed it, but let's ensure polygon closure)
        // Actually, let's just duplicate the first point at the end for clean looping
        const firstP = path[0];
        const lastP = path[path.length - 1];
        // Only if they are supposed to be connected.
        // In a grid loop, start and end are neighbors in 'adj'
        const startNeighbors = adj.get(k) || [];
        // The last added node in 'trace' loop was the one before we stopped.
        // We need to verify connectivity. 
        // Simplest way: if it's a loop, first and last geometric points are usually distinct grid edges but connected.
        // We should add the first point to the end to close the polyline.
        path.push(firstP);
      }
      paths.push(path);
    }
  }

  // 3. Apply Chaikin Smoothing
  return paths.map(p => smoothChaikin(p, 2));
};

/**
 * Chaikin's Corner Cutting Algorithm.
 * Smooths a polyline by replacing each corner with two points.
 * Great for technical drawing aesthetics.
 */
const smoothChaikin = (points: Point[], iterations: number): Point[] => {
  if (iterations === 0 || points.length < 3) return points;

  let current = points;
  
  for (let k = 0; k < iterations; k++) {
    const next: Point[] = [];
    const isClosed = Math.abs(current[0].x - current[current.length - 1].x) < 1e-5 && 
                     Math.abs(current[0].y - current[current.length - 1].y) < 1e-5;

    // If open, keep first point
    if (!isClosed) next.push(current[0]);

    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];

      // Q = 0.75 P0 + 0.25 P1
      next.push({
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y
      });

      // R = 0.25 P0 + 0.75 P1
      next.push({
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y
      });
    }

    // If open, keep last point
    if (!isClosed) next.push(current[current.length - 1]);
    else {
        // If closed, we need to bridge the gap created by cutting the last segment (which wraps)
        // But in our 'current' array, the last point IS the first point duplicated.
        // So the loop above handled the segment P[last-1] -> P[last] (which is P[0]).
        // So 'next' now ends with a point close to P[0].
        // We just need to close 'next' exactly.
        next.push(next[0]);
    }

    current = next;
  }

  return current;
};

// Deprecated but kept for type signature compatibility if needed
export const stitchSegments = (segments: Point[][]) => segments;
