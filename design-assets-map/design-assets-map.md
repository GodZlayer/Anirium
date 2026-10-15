# Design Assets Map – Animeflix

---
## 1️⃣ Overview
The visual identity of **Animeflix** follows the **TGCode** principle *"Scroll como Tempo, Interface como Mundo"* – the UI is a deterministic world that reacts directly to the scroll position. All assets must be built to support this timeline‑driven experience.

---
## 2️⃣ Branding & Logos
| Asset | Variations | Size / Ratio | File Format | Usage |
|------|------------|--------------|-------------|-------|
| **Primary Logo** | Full‑color, Black‑&‑white, Transparent background | 1:1 (square) | SVG, PNG (transparent) | Header, Footer, Social media, Press kits |
| **Wordmark** | Horizontal, Stacked | 4:1 (horizontal), 1:4 (stacked) | SVG, PNG | Navigation bar, landing hero, email signatures |
| **Icon‑only** | Simple glyph (kanji‑style “AN”) | 1:1 | SVG, PNG, ICO | Favicon, app icons, mobile splash |
| **Favicon** | 16×16, 32×32, 48×48 | – | ICO, PNG | Browser tab |
| **Apple Touch Icon** | 180×180 | – | PNG | iOS home‑screen |
| **Android Adaptive Icon** | Foreground 108×108, Background 432×432 | – | PNG | Android PWA |

**Guidelines**
- Keep a clear area equal to 20 % of the logo width around the glyph.
- Do not recolor the primary logo; colour variants are defined in the palette section.
- Use the monochrome version on dark backgrounds only.

---
## 3️⃣ Colour Palette
| Role | Hex | Usage |
|------|-----|-------|
| **Primary** – Anirium Blue | `#1E88E5` | Buttons, active tabs, progress bar |
| **Secondary** – Manga Red | `#E53935` | Alerts, error states, Plus badge |
| **Accent** – Karma Green | `#43A047` | Completed episode badge (green) |
| **Highlight** – Sunburst Yellow | `#FDD835` | In‑progress episode badge (yellow) – **PLUS only** |
| **Neutral Dark** – Charcoal | `#212121` | Backgrounds, text on light cards |
| **Neutral Light** – Snow | `#FAFAFA` | Card backgrounds, modal overlay |
| **Disabled / Unreleased** – Cool‑Gray | `#9E9E9E` | Unreleased episodes (gray) |

**Accessibility** – All colour pairs meet WCAG AA contrast ratios for normal text and UI components.

---
## 4️⃣ Typography
| Text type | Font family | Weights | Size (mobile / desktop) | Line height |
|----------|-------------|--------|------------------------|------------|
| **Headings (H1‑H4)** | `Inter` (Google Fonts) | 600, 700 | 24‑32 px / 32‑48 px | 1.2 |
| **Body / Paragraph** | `Inter` | 400, 500 | 14‑16 px / 16‑18 px | 1.5 |
| **Code / Tags** | `Source Code Pro` | 400 | 13 px | 1.4 |
| **Logo logotype** | Custom hand‑drawn **Animeflix Sans** (provided as OTF) | 700 | 48 px | – |

All fonts must be loaded via `@font-face` with `font-display: swap` for optimal CLS.

---
## 5️⃣ Iconography & SVG Set
- **Core UI icons** – Lucide‑react set (already imported). Export a custom SVG sprite (`assets/icons.svg`) containing any extra icons (e.g., `plus‑badge`, `mal‑sync`, `watch‑party`).
- **Status icons** – Circle with check, pause, play, and a small `⋮` for overflow.
- **File formats** – SVG for scalability, fallback PNG @2× for legacy browsers.
- **Naming convention** – `icon-{name}.svg` (e.g., `icon-play.svg`).

---
## 6️⃣ UI Component Assets
| Component | Asset(s) | Dimensions | Format |
|----------|----------|------------|--------|
| **Buttons** | Normal, Hover, Active states (background & border) | 48 px height, auto width | PNG (2×), SVG for icons |
| **Cards / AnimeTile** | Thumbnail placeholder, hover overlay, badge icons | 300 × 420 px (portrait) | WebP (lossless) |
| **Modals** | Background blur overlay, close‑icon | Full‑screen, 100 % width/height | PNG (transparent) |
| **Loading spinners** | Circular SVG animation | 48 px | SVG (inline) |
| **Progress bar** | Track, filled track, thumb | 100 % width × 4 px height | SVG/PNG |
| **Profile badges** | Plus badge, tier badge, gamified badge | 24 × 24 px | PNG (2×) |

All UI assets must be stored under `public/assets/ui/` with sub‑folders for each component.

---
## 7️⃣ Illustrations & Hero Banners
- **Hero section** – Two‑tone illustration (anime‑style silhouette + gradient) in 1920 × 1080 px. Provide both **light** and **dark** versions.
- **Season headers** – Background image per season (e.g., spring‑cherry, summer‑festival, autumn‑maple, winter‑snow). Size 1600 × 400 px.
- **Empty state** – Friendly mascot illustration (size 800 × 600 px) with CTA button.
- **Formats** – WebP (lossy for colour images), SVG for line‑art.

Store under `public/assets/illustrations/`.

---
## 8️⃣ Images for Content
| Type | Recommended size | Aspect ratio | Format |
|------|------------------|--------------|--------|
| **Anime cover / poster** | 500 × 750 px | 2:3 | WebP (lossless) |
| **Banner image** (main page) | 1920 × 540 px | 16:4.5 | WebP |
| **Episode thumbnail** | 240 × 135 px | 16:9 | WebP |
| **User avatar** | 128 × 128 px (rounded) | 1:1 | PNG (transparent) |
| **Comment avatar** | 48 × 48 px | 1:1 | PNG |

All images should have **optimized compression** (`cwebp -q 85`) and be served via a CDN.

---
## 9️⃣ Asset Folder Structure (recommended)
```
Animeflix/
├─ public/
│  ├─ assets/
│  │  ├─ icons/            # individual SVGs
│  │  ├─ ui/               # button, card, modal assets
│  │  ├─ illustrations/    # hero, season headers, empty states
│  │  ├─ logos/            # full‑color, mono, favicon, app icons
│  │  └─ images/           # content images (covers, banners)
│  └─ favicon.ico
├─ src/
│  └─ ... (code)
└─ design-assets-map/
   └─ design-assets-map.md  # **this file**
```

---
## 🔟 Deliverables Summary
1. **Design‑Assets‑Map markdown** (this file) – placed at `design-assets-map/design-assets-map.md`.
2. **Logo files** – SVG/PNG for all variations, stored in `public/assets/logos/`.
3. **Color palette** – CSS variables (`:root { --color-primary: #1E88E5; … }`).
4. **Typography files** – OTF/WOFF2 for `Inter` and `Source Code Pro`, plus `Animeflix Sans` logotype.
5. **SVG icon set** – `assets/icons.svg` + individual files.
6. **UI component assets** – PNG/WebP files for buttons, cards, modals, spinners.
7. **Illustrations** – Hero, seasonal banners, empty‑state mascot.
8. **Optimised content images** – cover, banner, episode thumbnails.
9. **Folder layout** – as described above.
10. **Accessibility checklist** – colour contrast, focus outlines, scalable SVGs.

---
## 📦 How to Use
1. **Copy the folder structure** into the repo (`public/assets/...`).
2. **Import the CSS variables** from `styles/theme.css` (generated from the palette).
3. **Reference logo assets** via `<Image src="/assets/logos/logo-full.svg" …>`.
4. **Load icons** using the SVG sprite: `<svg><use href="/assets/icons.svg#icon-play"/></svg>`.
5. **Apply colour classes** (`bg-primary`, `bg-success`, `bg-warning`, `bg-muted`) to episode buttons – the classes map directly to the colour palette defined.
6. **For PLUS users** enable the `bg-warning` (yellow) state via the `episode-inprogress` class in `EpisodeGrid`.

---
## 📌 Final notes
- Keep every asset **vector‑based** when possible to guarantee crisp rendering at any resolution (important for the deterministic scroll‑world model).
- All assets should be version‑controlled; commit the source SVG/OTF files and generate the WebP/PNG builds via the npm script `npm run assets:build` (script to be added to `package.json`).
- When adding new addons, place their icons inside `public/assets/logos/` and register the paths in the addon manifest (`serviceUrl`, `hooks`).

> **Ready for implementation** – place this markdown file inside `C:\Users\santo\Documents\Animeflix\design-assets-map\` and follow the folder structure to recreate the full visual language of Animeflix.
