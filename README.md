<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/14r8LAx1VWWMHJWbx87LSwKP8x_wXbbRa

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## GitHub Pages

Build the site for GitHub Pages (output will be placed in the `docs/` folder):

1. Install deps and build:

   ```bash
   npm install
   npm run build:gh-pages
   ```

2. Commit and push the `docs/` folder to the `main` branch.

3. In your repository settings on GitHub, enable GitHub Pages and set the source to the `docs/` folder on the `main` branch.

The site will be served at: `https://<your-username>.github.io/BecaonSim/`

Alternatively you can use the provided `deploy` script which builds and publishes using `gh-pages`:

```bash
npm run deploy
```

This will build the site and publish the output to the `gh-pages` branch.
