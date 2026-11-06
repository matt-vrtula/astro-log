# AstroLog

Astronomy observation log and planner: an interactive sky chart with your observations
(notes and photos) and planned targets pinned on it.

Live at https://astrolog-2e82d.web.app

Built with React + TypeScript (Vite) and Firebase (Hosting, Authentication with Google,
Firestore, Storage).

## Setup

1. `npm install`
2. `npx firebase login`

The Firebase web config lives in `src/firebase.ts` (it is public by design).

## Commands

- `npm run dev` – local dev server (http://localhost:5173)
- `npm run build` – type-check and build to `dist/`
- `npm run deploy` – build and deploy hosting, Firestore rules and Storage rules
- `npm run build:catalog` – re-download the star/NGC/IC catalogs into `public/data/`

## Project structure

- `src/sky/` – sky chart: catalog loading, astronomy math, canvas renderer, `SkyChart` component
- `src/data/` – Firestore/Storage access (observations, plans, photos, user location)
- `src/components/` – UI: object panel, plan sidebar, forms, lightbox, search, chart controls
- `firestore.rules`, `storage.rules` – security rules: each user can only access their own data
- `scripts/build-catalog.mjs` – generates `public/data/*.json`

## Data

- Deep-sky objects: [OpenNGC](https://github.com/mattiaverga/OpenNGC) by Mattia Verga, CC BY-SA 4.0
- Stars (Hipparcos to mag 8), constellations, Milky Way:
  [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn, BSD-3-Clause

See `public/data/LICENSES.txt`.
