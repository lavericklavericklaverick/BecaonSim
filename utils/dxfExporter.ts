
import { Point } from '../types';

/**
 * Generates a clean DXF string using LWPOLYLINE for continuous paths.
 * LWPOLYLINE (Lightweight Polyline) is standard for AC1015+ and 
 * provides a single selectable object in CAD.
 */
export const generateDXF = (paths: Point[][]): string => {
  // Use AC1015 (AutoCAD 2000) for LWPOLYLINE support
  // $INSUNITS: 4 = Millimeters. 
  // This ensures that coordinates (e.g. 1000) are treated as 1000mm.
  let dxf = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n`;
  
  dxf += `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n1\n0\nLAYER\n2\nVisibility_Boundary\n70\n0\n62\n3\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n`;
  
  dxf += `0\nSECTION\n2\nENTITIES\n`;

  paths.forEach((path) => {
    if (path.length < 2) return;

    const isClosed = Math.abs(path[0].x - path[path.length - 1].x) < 1e-4 && 
                     Math.abs(path[0].y - path[path.length - 1].y) < 1e-4;

    dxf += `0\nLWPOLYLINE\n`;
    dxf += `8\nVisibility_Boundary\n`; // Layer
    dxf += `90\n${path.length}\n`;    // Number of vertices
    dxf += `70\n${isClosed ? 1 : 0}\n`; // 1 = closed, 0 = open
    dxf += `43\n0.0\n`;               // Constant width

    path.forEach((p) => {
      dxf += `10\n${p.x.toFixed(4)}\n`; // X coordinate
      dxf += `20\n${p.y.toFixed(4)}\n`; // Y coordinate
    });
  });

  dxf += `0\nENDSEC\n0\nEOF\n`;
  return dxf;
};

export const downloadDXF = (paths: Point[][], filename: string = 'LED_Visibility_Contour.dxf') => {
  const content = generateDXF(paths);
  const blob = new Blob([content], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
