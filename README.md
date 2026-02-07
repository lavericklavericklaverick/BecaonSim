# LED Visibility Simulator

An advanced web-based simulator for visualizing the photometric propagation of LED arrays in dark environments. This application helps engineers and designers estimate realistic visibility distances by accounting for scotopic vision, beam patterns, and atmospheric attenuation.

## 🌟 Key Features

*   **Advanced Photometry Engine:**
    *   **Dual Efficiency Models:** Uses both **CIE 1951 Scotopic** (rod-mediated) and **CIE 1924 Photopic** (cone-mediated) luminous efficiency functions.
    *   **Wavelength Sensitivity:** Accurately models the human eye's increased sensitivity to blue/green wavelengths in low-light conditions.
    *   **Atmospheric Attenuation:** Simulates light loss over distance due to atmospheric conditions.

*   **Interactive Visualization:**
    *   **2D Heatmaps:** Analyze illuminance distribution with top-down and side-view heatmaps.
    *   **3D Visualization:** Explore the full 3D beam pattern interactively using Three.js.
    *   **Real-time Controls:** Adjust LED parameters (intensity, wavelength, beam angle) and visualize changes instantly.
    *   **Auto-scaling:** Automatically adjusts the view to fit the calculated visibility range.

*   **Engineering Utilities:**
    *   **DXF Export:** Generate and download precise visibility boundary contours as DXF files for CAD integration.
    *   **Detailed Metrics:** Real-time feedback on max visibility distance, beam width, and efficiency factors.

## 🚀 Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) (v16 or higher recommended)
*   npm (included with Node.js)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/lavericklavericklaverick/BecaonSim.git
    cd BecaonSim
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

### Running Locally

Start the development server:

```bash
npm run dev
```

Open your browser and navigate to `http://localhost:5173/BecaonSim/` (or the URL provided in the terminal).

### Building for Production

To create a production build:

```bash
npm run build
```

The output will be generated in the `docs/` directory, ready for deployment.

## 🛠️ Technology Stack

*   **Frontend Framework:** React (with TypeScript)
*   **Styling:** Tailwind CSS v4
*   **3D Graphics:** Three.js / @react-three/fiber
*   **Data Visualization:** D3.js
*   **Build Tool:** Vite

## 📄 License

This project is open source.
