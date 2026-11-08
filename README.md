# SocialAmp — Water Reflection

**A concept design.** This is an interactive hero experience exploring how film key art can live inside a calm, photographic ocean scene. It isn't a production website: there's no copy, branding or call to action, by design. The page exists to show off the motion, light and interaction ideas below.

**Live demo:** https://vsenses55.github.io/socialamp-water-concept/

---

## What it shows

| Feature | What you see |
|---|---|
| **Living water** | The original water photograph stays the base. Slow swells roll toward the viewer, light catches the crests, and the glints shimmer. The photo is animated rather than replaced by a 3D ocean, so it never stops looking like the artwork. |
| **Real reflections** | The film card is mirrored into the water. The reflection blurs with distance, picks up the water's blue tint, bends with the swells and fades out naturally. The card's lower edge dissolves into the water instead of sitting on top of it. |
| **Interactive sun** | The sunburst follows the cursor with a heavy, eased drift, within a range that protects the composition. Its path on the water moves with it, the card's edge facing the sun picks up rim light, and a soft sheen tracks the light across the card. When the cursor leaves, the sun drifts home. |
| **Card tilt** | The card turns a few degrees in true perspective as the cursor moves, and its reflection turns with it. |
| **Liquid film transition** | Three films rotate automatically. Each change melts the next film in through soft, organic patches with water-like refraction, and sends a ripple across the water from the card's base. |
| **Snapping title wheel** | The film titles work like a picker wheel. One scroll, swipe or arrow key moves exactly one title, and it clicks into place with a slight overshoot. The current title is always white and centered, with the previous and next titles faded above and below. The list loops, and the wheel and the film always move together. |
| **Responsive** | The water and sky fill any screen. The card and titles scale to fit everything from phones to ultrawide monitors. |
| **Accessible motion** | Visitors who have reduced motion turned on get a simple crossfade and no tilt. Screen readers hear which film is showing. |

---

## Technology

- **[Three.js](https://threejs.org/) r160 (WebGL).** Used as a lightweight renderer for one full-screen **GLSL fragment shader**. Everything is drawn in that single shader pass, in layers:
  1. **Water plate.** The clean photo, displaced by a procedural swell field (fractal value noise projected onto a perspective ground plane), with crest highlights and glint shimmer.
  2. **Sun.** The original glow layer composited with a **Screen** blend. The blend was fitted to the original artwork, so at rest the sun matches the designed comp to within about 2 brightness levels out of 255. The sun path on the water comes from a high-pass map of the plate's own streaks, so it always breaks up like the real water.
  3. **Title wheel.** Rendered to a 2D canvas, uploaded as a premultiplied texture, and drawn under the card. It isn't reflected, matching the comp.
  4. **Reflection.** The card mirrored about its waterline, sampled with an 11-tap vertical blur, refracted by the same swell field and tinted into the water.
  5. **Card.** Rounded top corners, about 10% see-through, with a wavy, swell-driven waterline, rim light and sheen from the sun, and a perspective tilt that is undone per pixel (a rotation about the card's vertical axis).
- **Plate-space layout.** Every position is defined in the artwork's own pixel space (2560 × 1440) and mapped to the screen like `background-size: cover`, so the scene lines up with the original design at any size.
- **Liquid dissolve.** A fractal-noise threshold mask with a soft edge, plus a refraction offset that peaks halfway through, eased with a smootherstep curve.
- **Spring physics.** A slightly underdamped spring drives the title wheel, which gives the "click into place" feel. Wheel and trackpad input is grouped into gestures, so momentum scrolling counts as one step.
- **Typography.** [Archivo](https://fonts.google.com/specimen/Archivo) Black Expanded (weight 900, width 125%) via Google Fonts, with tightened tracking.
- **No build step and no framework.** It's plain HTML and an ES module. Three.js is included in `vendor/`, so the page doesn't depend on a CDN.

---

## Project structure

```
index.html              page shell (canvas, import map, screen-reader text)
js/main.js              the whole experience: shader, sun, wheel, rotation, input, layout
assets/
  water-plate.jpg       clean water plate (no sun)
  sun-glow.png          sun glow layer (alpha)
  water-streaks.png     high-pass map of the plate's streaks (drives the sun path)
  films/                key art, 2:1 (2048 × 1024)
vendor/
  three.module.min.js   Three.js r160
  three-LICENSE.txt     Three.js MIT license
.nojekyll               tells GitHub Pages to serve the files as-is
```

### Changing the films
Replace the images in `assets/films/` (2:1, ideally 2400 × 1200 JPG, keeping important content out of the bottom 20%), then edit the `FILMS` and `TITLES` lists at the top of `js/main.js`. Darker key art sits best in the water.

### Tuning
The constants at the top of `js/main.js` control the timing and limits: `HOLD` (seconds per film), `FLOOD` / `USER_FLOOD` (transition length), `IDLE` (pause after the user scrolls), `TRACK` (title letter spacing), `SUN_MIN` / `SUN_MAX` (how far the sun can travel) and `TILT_MAX` (card tilt).

---

## Previewing locally

The page uses JavaScript modules, so it needs to be served rather than opened by double-clicking `index.html`. Either:
- open the folder in VS Code and use the **Live Server** extension, or
- in Terminal, inside the folder: `python3 -m http.server`, then visit `http://localhost:8000`.

## Publishing with GitHub Desktop + GitHub Pages

1. In **GitHub Desktop**: *File → New Repository*. Name it (for example `socialamp-water-concept`) and choose the folder that **contains** this project folder as the local path.
   *(Or, if the repository already exists, copy these files into it.)*
2. Commit all files to `main`, then click **Publish repository**. Untick "Keep this code private" if you want a public demo.
3. On github.com, open the repository: *Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save*.
4. After a minute or two, the site is live at https://vsenses55.github.io/socialamp-water-concept/.

Later changes: edit the files, commit in GitHub Desktop, then **Push origin**. Pages redeploys automatically.

---

## Browser support

Current Chrome, Edge, Safari and Firefox on desktop and mobile (WebGL required). If WebGL isn't available, the static water plate shows as a fallback.

## Credits & notice

Concept, art direction and design: **Orlando / Visual Senses**.
*Black Phone*, *Violent Night* and *Nope* key art and titles belong to their respective studios and rights holders. They're used here only to demonstrate the concept, and this project isn't affiliated with or endorsed by them.
Three.js is © its authors under the MIT license (see `vendor/three-LICENSE.txt`).
