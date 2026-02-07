
import React from 'react';

const Instructions: React.FC = () => {
  return (
    <div className="bg-gray-900 border border-white/5 rounded-[3rem] p-8 shadow-3xl overflow-hidden ring-1 ring-white/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-4xl mx-auto space-y-12">
        
        {/* Intro */}
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-black text-white tracking-tight">OPERATIONAL MANUAL</h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            This simulator models the photometric propagation of LED arrays in low-light environments. 
            It utilizes scotopic/photopic composite efficiency curves to estimate realistic visibility distances.
          </p>
        </div>

        {/* Section 1: Datasheet Mapping */}
        <div className="space-y-6">
          <div className="flex items-center gap-4 border-b border-white/5 pb-4">
             <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                <i className="fas fa-file-contract text-xl"></i>
             </div>
             <h3 className="text-xl font-bold text-white uppercase tracking-wider">1. Mapping Datasheets to Input</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-black/20 p-6 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-colors group">
              <h4 className="text-indigo-400 font-black uppercase tracking-widest text-xs mb-3">Luminous Intensity (Iv)</h4>
              <p className="text-gray-400 text-sm leading-relaxed mb-3">
                Found in the "Optical Characteristics" table. Look for values in <b>candela (cd)</b> or <b>millicandela (mcd)</b>.
              </p>
              <div className="bg-gray-900/80 p-3 rounded-lg border border-white/10 font-mono text-xs text-emerald-400">
                1000 mcd = 1.0 cd
              </div>
              <p className="text-gray-500 text-[10px] mt-2 italic">Input this into the "Peak Intensity" slider.</p>
            </div>

            <div className="bg-black/20 p-6 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-colors group">
               <h4 className="text-indigo-400 font-black uppercase tracking-widest text-xs mb-3">Dominant Wavelength (λd)</h4>
               <p className="text-gray-400 text-sm leading-relaxed mb-3">
                 Determines color. At night (scotopic vision), the eye is far more sensitive to blue/green (450-520nm) than red.
               </p>
               <div className="bg-gray-900/80 p-3 rounded-lg border border-white/10 font-mono text-xs text-blue-400">
                 Green (525nm) ≈ 5x brighter than Red
               </div>
            </div>

            <div className="bg-black/20 p-6 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-colors group md:col-span-2">
               <div className="flex flex-col md:flex-row gap-8 items-center">
                   <div className="flex-1">
                       <h4 className="text-indigo-400 font-black uppercase tracking-widest text-xs mb-3">Beam Diagram (Radiation Pattern)</h4>
                       <p className="text-gray-400 text-sm leading-relaxed mb-4">
                         Datasheets provide a "Spatial Radiation Pattern" polar plot (see diagram). 
                         This defines how light spreads from the LED.
                       </p>
                       <div className="bg-indigo-500/10 rounded-xl p-4 border border-indigo-500/20">
                           <p className="text-indigo-200 text-xs font-bold mb-2 uppercase tracking-wide">How to use:</p>
                           <ul className="text-gray-400 text-xs space-y-2 list-disc list-inside">
                               <li>Identify the <b className="text-white">Relative Intensity (%)</b> at specific <b className="text-white">Angles (°)</b>.</li>
                               <li>Example: If the curve crosses the 50% line at 20°, enter <b>Angle: 20, Intensity: 0.5</b> in the Beam Pattern Table.</li>
                               <li>The "0°" point is always 1.0 (100%).</li>
                           </ul>
                       </div>
                   </div>
                   <div className="w-full md:w-72 flex-shrink-0 bg-white p-4 rounded-xl shadow-lg opacity-90">
                       <svg viewBox="0 0 300 190" className="w-full h-auto text-black">
                           <defs>
                             <linearGradient id="beamGrad" x1="0" x2="0" y1="0" y2="1">
                               <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4"/>
                               <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0"/>
                             </linearGradient>
                           </defs>

                           {/* Grid Lines */}
                           <path d="M 150 160 L 150 10" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 2" />
                           <path d="M 20 160 L 280 160" stroke="#e5e7eb" strokeWidth="1" />
                           
                           {/* Radial Arcs */}
                           <circle cx="150" cy="160" r="130" fill="none" stroke="#f3f4f6" strokeWidth="1" />
                           <circle cx="150" cy="160" r="97.5" fill="none" stroke="#e5e7eb" strokeWidth="1" />
                           <circle cx="150" cy="160" r="65" fill="none" stroke="#e5e7eb" strokeWidth="1" />
                           <circle cx="150" cy="160" r="32.5" fill="none" stroke="#f3f4f6" strokeWidth="1" />
                           
                           {/* Angular Lines */}
                           <path d="M 150 160 L 262 95" stroke="#f3f4f6" strokeWidth="1" /> {/* 30 deg */}
                           <path d="M 150 160 L 38 95" stroke="#f3f4f6" strokeWidth="1" /> {/* -30 deg */}
                           <path d="M 150 160 L 215 47" stroke="#e5e7eb" strokeWidth="1" /> {/* 60 deg */}
                           <path d="M 150 160 L 85 47" stroke="#e5e7eb" strokeWidth="1" /> {/* -60 deg */}

                           {/* Beam Shape */}
                           <path d="M 150 160 
                                    C 165 110, 180 50, 150 20 
                                    C 120 50, 135 110, 150 160" 
                                 fill="url(#beamGrad)" stroke="#4f46e5" strokeWidth="2.5" />
                           
                           {/* Labels */}
                           <text x="150" y="180" fontSize="10" textAnchor="middle" fontWeight="bold" fill="#374151">0°</text>
                           <text x="280" y="175" fontSize="8" textAnchor="middle" fill="#6b7280">90°</text>
                           <text x="20" y="175" fontSize="8" textAnchor="middle" fill="#6b7280">-90°</text>
                           <text x="220" y="45" fontSize="8" textAnchor="middle" fill="#6b7280">60°</text>
                           <text x="80" y="45" fontSize="8" textAnchor="middle" fill="#6b7280">-60°</text>

                           <text x="150" y="15" fontSize="9" textAnchor="middle" fill="#4f46e5" fontWeight="bold">100%</text>
                           <text x="185" y="110" fontSize="8" textAnchor="middle" fill="#6b7280">50%</text>

                           <text x="150" y="5" fontSize="8" textAnchor="middle" letterSpacing="1" fontWeight="bold" fill="#111827">SCANNING ANGLE (deg)</text>
                       </svg>
                   </div>
               </div>
            </div>
          </div>
        </div>

        {/* Section 2: Array Geometry Guide (NEW) */}
        <div className="space-y-6">
          <div className="flex items-center gap-4 border-b border-white/5 pb-4">
             <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400">
                <i className="fas fa-th text-xl"></i>
             </div>
             <h3 className="text-xl font-bold text-white uppercase tracking-wider">2. Array Geometry Guide</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {/* Matrix Visualization */}
            <div className="bg-black/20 rounded-2xl p-6 border border-white/5 flex flex-col items-center">
                <h5 className="text-cyan-400 font-black text-xs uppercase tracking-widest mb-6 text-center">Physical Matrix</h5>
                <svg viewBox="0 0 200 130" className="w-full h-auto max-w-[280px]">
                    {/* PCB */}
                    <rect x="40" y="30" width="120" height="90" rx="4" fill="#1f2937" stroke="#374151" strokeWidth="2" />
                    
                    {/* LEDs - 3 Rows, 4 Cols */}
                    {[45, 75, 105].map(y => (
                        [55, 85, 115, 145].map(x => (
                            <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#fbbf24" stroke="#d97706" strokeWidth="1" />
                        ))
                    ))}

                    {/* Brackets */}
                    <path d="M 55 20 L 55 25 L 145 25 L 145 20" stroke="#9ca3af" fill="none" strokeWidth="1.5" />
                    <text x="100" y="15" fill="#9ca3af" fontSize="10" fontWeight="bold" textAnchor="middle">4 COLUMNS</text>

                    <path d="M 20 45 L 25 45 L 25 105 L 20 105" stroke="#9ca3af" fill="none" strokeWidth="1.5" />
                    <text x="15" y="75" fill="#9ca3af" fontSize="10" fontWeight="bold" textAnchor="middle" transform="rotate(-90, 15, 75)">3 ROWS</text>
                </svg>
                <div className="mt-4 text-[10px] text-gray-500 text-center leading-relaxed">
                   More LEDs increase total output power.<br/>
                   <span className="text-cyan-400 font-bold">Columns</span> scale width. <span className="text-cyan-400 font-bold">Rows</span> scale height.
                </div>
            </div>

            {/* Angular Spread Visualization */}
            <div className="bg-black/20 rounded-2xl p-6 border border-white/5 flex flex-col items-center">
                <h5 className="text-cyan-400 font-black text-xs uppercase tracking-widest mb-6 text-center">Angular Spread (Fan-out)</h5>
                <svg viewBox="0 0 200 130" className="w-full h-auto max-w-[280px]">
                     {/* Top Down View */}
                     <text x="100" y="10" fill="#4b5563" fontSize="8" fontWeight="bold" textAnchor="middle">TOP DOWN VIEW</text>
                     
                     {/* Source */}
                     <circle cx="100" cy="110" r="4" fill="#fbbf24" stroke="#d97706" />
                     
                     {/* Rays */}
                     <line x1="100" y1="110" x2="50" y2="40" stroke="#fbbf24" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
                     <line x1="100" y1="110" x2="150" y2="40" stroke="#fbbf24" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
                     
                     {/* Center Line */}
                     <line x1="100" y1="110" x2="100" y2="25" stroke="#4b5563" strokeWidth="1" strokeDasharray="6 2" />

                     {/* LEDs on Arc representing fan-out */}
                     <path d="M 70 65 Q 100 50 130 65" fill="none" stroke="#4b5563" strokeWidth="1" opacity="0.5" />
                     {[70, 85, 100, 115, 130].map(x => (
                         <circle key={x} cx={x} cy={65 + Math.abs(100-x)*-0.15} r="2.5" fill="#34d399" />
                     ))}

                     {/* Angle Arc */}
                     <path d="M 50 40 Q 100 10 150 40" fill="none" stroke="#6366f1" strokeWidth="2" />
                     <text x="100" y="30" fill="#818cf8" fontSize="10" fontWeight="bold" textAnchor="middle" letterSpacing="0.5">PLAN SPREAD</text>
                </svg>
                 <div className="mt-4 text-[10px] text-gray-500 text-center leading-relaxed">
                   Spreading LEDs covers more area but reduces intensity at the center.<br/>
                   Use <span className="text-indigo-400 font-bold">Spread Angle</span> to configure this fan-out.
                </div>
            </div>
          </div>
        </div>

        {/* Section 3: Physics */}
        <div className="space-y-6">
          <div className="flex items-center gap-4 border-b border-white/5 pb-4">
             <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <i className="fas fa-atom text-xl"></i>
             </div>
             <h3 className="text-xl font-bold text-white uppercase tracking-wider">3. Physics of Visibility</h3>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
              <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 mt-1">
                      <i className="fas fa-eye text-emerald-400 text-xs"></i>
                  </div>
                  <div>
                      <h4 className="text-white font-bold text-sm">The Purkinje Effect</h4>
                      <p className="text-gray-400 text-xs leading-relaxed mt-1">
                          In low-light (mesopic/scotopic) conditions, the human eye shifts from cone-based vision (color) to rod-based vision (monochrome). Rods are highly sensitive to blue-green light but almost blind to red. This simulator calculates a <b>Composite Efficiency</b> based on the wavelength to accurately model this night-time boost for cool colors.
                      </p>
                  </div>
              </div>

              <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 mt-1">
                      <i className="fas fa-bolt text-yellow-400 text-xs"></i>
                  </div>
                  <div>
                      <h4 className="text-white font-bold text-sm">Temporal Conspicuity (Flashing)</h4>
                      <p className="text-gray-400 text-xs leading-relaxed mt-1">
                          A flashing light captures peripheral attention much more effectively than a steady source. The simulator applies a detection gain (lowering the required threshold by ~8x) when "Flashing" mode is enabled, simulating the increased likelihood of detection at distance.
                      </p>
                  </div>
              </div>
          </div>
        </div>

        {/* Section 4: Optimization */}
        <div className="space-y-6">
          <div className="flex items-center gap-4 border-b border-white/5 pb-4">
             <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                <i className="fas fa-magic text-xl"></i>
             </div>
             <h3 className="text-xl font-bold text-white uppercase tracking-wider">4. Using the Optimizer</h3>
          </div>

          <div className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border border-indigo-500/20 rounded-2xl p-6">
              <ol className="list-decimal list-inside space-y-4 text-sm text-gray-300">
                  <li>
                      <span className="text-white font-bold">Define Constraints:</span> Input the minimum physical volume you need the light to cover.
                      <ul className="list-disc list-inside pl-6 mt-2 text-gray-400 text-xs space-y-1">
                          <li><b>Min Width:</b> Lateral coverage required.</li>
                          <li><b>Min Height:</b> Vertical coverage required.</li>
                          <li><b>Min Range:</b> Forward distance required.</li>
                      </ul>
                  </li>
                  <li>
                      <span className="text-white font-bold">Run Scan:</span> Click <span className="text-yellow-400 font-mono text-xs bg-white/10 px-1 py-0.5 rounded">Find Options</span>. The engine will simulate thousands of mechanical configurations (Plan/Elevation angles).
                  </li>
                  <li>
                      <span className="text-white font-bold">Select Solution:</span> The list will populate with valid configurations, sorted by maximum volumetric coverage. Click any row to instantly apply those angles to the visualizer and see the <b>Target Box</b> overlay.
                  </li>
              </ol>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Instructions;
