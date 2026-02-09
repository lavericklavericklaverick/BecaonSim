<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1vSGgWajnqrbaChyTBILO_0MoVAQS-GXw

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Deploy to GitHub Pages (command line)

This repo is configured to deploy to:

- `https://lavericklavericklaverick.github.io/BecaonSim/`

### One-time GitHub setting

In your GitHub repo: **Settings → Pages**

- **Build and deployment**: “Deploy from a branch”
- **Branch**: `gh-pages` / `root`

### Deploy steps

1. Install deps:
   `npm install`
2. Deploy (builds into `dist/` then publishes to the `gh-pages` branch):
   `npm run deploy`

That’s it—after GitHub finishes publishing, refresh the Pages URL.
