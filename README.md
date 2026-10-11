# Aurum Estates — cinematic 3D real-estate website

A scroll-driven, cinematic 3D website for a plot / layout developer in Coimbatore, modelled on the structure of
plot-listing sites such as G Square's "Plots in Coimbatore" page (hero + search, project listings by locality,
approvals, amenities, trust stats, enquiry form) — but with an original brand, copy and a real-time WebGL world.

> All projects, prices, figures and contact details are **sample content**. Replace them in
> `src/data/content.js` before going live.

## What's inside

| Scene / chapter | What happens |
| --- | --- |
| **Preloader** | Animated monogram, counter and curtain wipe, then a 5-second aerial fly-in |
| **Hero** | Golden-hour aerial over a procedurally generated gated layout, Western Ghats ridges, the river, letterbox bars, film grain |
| **The Land** | Camera swoops to the entrance arch; manifesto words light up as you scroll |
| **Projects** | Pinned horizontal gallery of 6 projects with generated site-plan art, 3D tilt, area & budget filters |
| **Masterplan** | Top-down 3D layout, colour-coded by **available / booked / sold**. Hover for a tooltip, click any plot for size, dimensions, facing and indicative price, then "Enquire" pre-fills the form |
| **Living** | Houses rise across sold plots as the camera glides past the clubhouse and pool |
| **Legacy → Visit** | Sun sets in real time: dusk, twilight, night; street lamps, windows and the pool glow (bloom); stars and moon come out |

Also: Lenis smooth scrolling, custom cursor and magnetic buttons, HUD with chapter index and time-of-day,
EMI calculator, testimonial slider, FAQ accordion, site-visit booking form with WhatsApp hand-off,
mobile layout (swipe gallery, bottom-sheet masterplan, lighter GPU settings), `prefers-reduced-motion` support
and a static fallback when WebGL isn't available.

## Tech

- [Three.js](https://threejs.org) — terrain, instanced plots / houses / trees / lamps, physical sky, PMREM reflections,
  UnrealBloom and a custom grade pass (chromatic aberration, split-tone, vignette, grain)
- [GSAP](https://gsap.com) + ScrollTrigger — reveals, pinning, counters
- [Lenis](https://github.com/darkroomengineering/lenis) — smooth scroll
- [Vite](https://vitejs.dev) — dev server and build. Fonts are self-hosted via Fontsource.

No external images or 3D models: everything is generated in code, so the build is ~260 kB gzipped JS.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the build
```

`dist/` is fully static (relative paths), so it can be hosted on GitHub Pages, Netlify, Vercel, S3, or any web server.
A GitHub Pages workflow is included in `.github/workflows/deploy.yml`. Enable Pages with source "GitHub Actions"
and push to `main`.

## Customising

- **Content** — `src/data/content.js`: brand, projects (name, locality, price, sizes, approvals, highlights,
  colour palette for the card art), amenities, stats, testimonials, FAQs and chapter labels.
- **Masterplan layout** — `src/scene/site.js`: road grid, block subdivision, plot status mix, trees and lamps.
  1 world unit ≈ 3 ft; plot prices use the flagship project's `ratePerSqft`.
- **Camera path** — `KEYFRAMES` in `src/main.js`: each keyframe is pinned to a section (`start` / `center` / `end`)
  with camera position, look-at target, `night` (0 = golden hour, 1 = night), `build` (houses rising) and
  `plan` (masterplan colouring).
- **Look** — colours and type in `src/styles.css`; post-processing in `src/scene/CinematicShader.js`.
- **Form backend** — the booking form validates and offers a WhatsApp hand-off. Wire your CRM where the `TODO`
  is in `src/main.js`.
