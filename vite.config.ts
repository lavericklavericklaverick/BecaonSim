
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// For GitHub Pages, Vite must know the repo sub-path.
// Your target URL is: https://lavericklavericklaverick.github.io/BecaonSim/
const GH_PAGES_BASE = '/BeaconSim/'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Use / locally so dev server works at http://localhost:5173/
  // Use /<repo>/ for production builds deployed to GitHub Pages.
  base: command === 'build' ? GH_PAGES_BASE : '/',
  build: {
    outDir: 'dist',
  },
}))
