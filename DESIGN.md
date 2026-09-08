---
name: PDF Composer
description: A brutalist riso-poster composing workbench for researchers.
colors:
  paper: "oklch(95% 0.014 85)"
  paper-deep: "oklch(91% 0.016 85)"
  ink: "oklch(23% 0.014 62)"
  ink-soft: "oklch(44% 0.014 62)"
  noir: "oklch(20% 0.014 8)"
  noir-deep: "oklch(15% 0.012 8)"
  rose: "oklch(62% 0.19 8)"
  rose-deep: "oklch(48% 0.17 14)"
  rose-light: "oklch(72% 0.16 8)"
  ochre: "oklch(66% 0.12 74)"
typography:
  display:
    fontFamily: "Anton, 'Arial Narrow', system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 8vw, 6rem)"
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: "0.005em"
    textTransform: "uppercase"
  headline:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "clamp(1.15rem, 2.4vw, 1.5rem)"
    fontWeight: 600
    lineHeight: 1.1
  title:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: "0.72rem"
    fontWeight: 500
    letterSpacing: "0.06em"
    textTransform: "uppercase"
rounded:
  none: "0px"
  sm: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
texture:
  grain:
    use: "Riso/photocopy noise on noir hero surfaces only. Static, low opacity, multiply/overlay blend. Never behind working text."
    value: "SVG feTurbulence (fractalNoise, baseFrequency 0.65, 3 octaves) tiled 300px, 13% opacity, mix-blend-mode: screen"
  halftone:
    use: "Dot pattern for duotone image treatment and the empty-state field. Hero surfaces only."
    value: "radial-gradient dot tile or an SVG pattern, rose/noir, ~8px cell"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.rose-deep}"
    textColor: "{colors.paper}"
  button-ghost:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "9px 16px"
  chip-citation:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
  chip-cover:
    backgroundColor: "{colors.ochre}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
  input:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
  stamp:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    border: "2px solid {colors.ink}"
    padding: "3px 8px"
---

# Design System: PDF Composer

## 1. Overview

**Creative North Star: "The Composing Stick, printed as a poster."**

A composing stick is the typesetter's hand tool for assembling metal type one exact line at a time.
That is the product's soul: a researcher composing pages with precision, by hand, into something
printable. The skin is the brutalist riso poster, the language of the reference set: a charcoal
ground, one duotone ink, heavy condensed display type, monospace detail, matte print grain, and a
tight grid of framed windows. The bridge between the two is literal. Those reference posters frame
their photographs in 2px-ruled windows with corner ticks; this app frames PDF pages in exactly the
same windows. The product's core gesture and the reference vocabulary are the same act, so the design
does not decorate the tool, it names what the tool already does.

The system runs on two grounds, and which one a surface uses is a deliberate, load-bearing choice:

- **The bench (light).** Every working surface, the page list, the composition preview, every panel
  where a researcher reads and selects for long stretches, is warm newsprint paper with near-black
  ink. This is the WCAG-AA, low-glare, aging-eyes ground the product is built for. Detail work
  happens here. Grain never touches it.
- **The poster (noir).** Brand moments, the empty state, the export-complete confirmation, the
  wordmark band, are full poster: a charcoal field, riso-rose duotone, grain, condensed display, and
  graphic furniture. The drama of the references lives here, where there is no dense reading to
  protect.
- **The shape-poster wall (noir/overview).** The All Documents grid is a deliberate third context:
  a noir grain wall on which cream poster-cards are pinned, one per document. The cards carry the
  shape-poster vocabulary (generated line-art moiré shape, dark grain field, Anton title band,
  "P.0x" catalog codes, corner registration ticks). The cover page is not shown here; it opens with
  the document. This surface is not a working bench — it is a navigational gallery, so noir is
  appropriate. Citation docs draw their shape in rose-light.

The interface reads as printed, not styled. Panels are bounded by 2px ink rules, not faint gray
hairlines. Depth is a hard solid offset, the way a letterpress block sits proud of the bed, never a
blurred drop shadow. Color is flat ink, two inks at most on any surface, never a gradient and never a
glow.

A note on the dark surfaces, because it matters. The noir poster is **not** the trendy dark-neon look
the product rejects. There are no gradients, no glassmorphism, no bloom or glow, no AI-startup sheen.
It is flat charcoal, one flat rose ink, and matte photocopy grain. That distinction, flat duotone
print versus glowing neon, is the whole reason the dark surfaces honor the brand instead of betraying
it.

**Key Characteristics:**
- Two grounds with one rule each: paper for working and reading, noir for brand and confirmation.
- One duotone accent, riso-rose, plus an ochre reserved entirely for the cover. The frames carry the
  rest of the color.
- Heavy ink rules (2px) and square corners (0px, 2px max) everywhere. No rounded SaaS cards, no gray
  hairlines.
- Condensed black display (Anton) for poster headlines and the wordmark only; grotesque and mono do
  all functional work.
- Graphic furniture from the references, registration marks, mono code numbers, a stamp, framed
  windows, used with restraint as real UI, not as stickers.

## 2. Colors

A warm newsprint bench, a charcoal poster, one riso-rose duotone, and an ochre that belongs only to
the cover. The palette is small on purpose: the framed documents bring the rest.

### Primary
- **Rose** (oklch(62% 0.19 8)): the duotone ink. Its loud, saturated form is for **large display and
  image duotone on noir** only, the poster headline, the framed-window tint, the wordmark. Used flat,
  never as a gradient.
- **Rose Deep** (oklch(48% 0.17 14)): the **text-and-state-safe** rose. This is the only rose allowed
  to carry meaning at UI size on the light bench, the active citation rule, primary-button hover,
  focus emphasis. It clears 4.5:1 on paper; the loud Rose does not, and is never used for small text.
- **Rose Light** (oklch(72% 0.16 8)): the text-safe rose on **noir**, for the rare small rose label
  or value on a dark surface. Clears 4.5:1 on noir.

### Tertiary
- **Ochre** (oklch(66% 0.12 74)): reserved exclusively for the cover page, its badge and selected
  rule. A different hue from rose (74 vs 8) so the cover is never confused with a citation. Never a
  general accent.

### Neutral, the bench
- **Paper** (oklch(95% 0.014 85)): warm newsprint. The app background and every working surface.
- **Paper Deep** (oklch(91% 0.016 85)): recessed surfaces, the page-list well, inputs at rest. A
  tonal step, not a bordered card.
- **Ink** (oklch(23% 0.014 62)): body text, every structural rule and border, primary fill. Warm
  near-black, never pure #000.
- **Ink Soft** (oklch(44% 0.014 62)): secondary text, captions, the mono meta line. Holds AA on paper.

### Neutral, the poster
- **Noir** (oklch(20% 0.014 8)): the charcoal hero ground. A faint warm-rose cast so the rose duotone
  sits in the same family. Carries grain and condensed display.
- **Noir Deep** (oklch(15% 0.012 8)): the deepest field, behind a duotone image or under grain.
- On noir, text is **paper** (high contrast) and accents are **rose-light**; ink is invisible here
  and never used for text on noir.

### Named Rules
**The Two-Grounds Rule.** Surfaces are bench (paper, for reading and working), poster (noir, for
brand and confirmation), or shape-poster wall (noir, for the All Documents navigational gallery only).
Choosing noir for a *dense working surface* is a violation — it trades legibility for drama. The
All Documents grid is not a dense working surface; it is a navigational gallery, so noir is correct
there. Any other working panel (page list, preview, modal, per-doc workspace) is always bench.

**The Ink-and-Paper Rule.** Structure is drawn in ink at 2px, or as a paper-deep tonal fill, never a
1px light-gray hairline. Faint dividers read as SaaS and are prohibited.

**The One Duotone Rule.** Rose is the only general accent, and stays under ~10% of any bench screen.
Loud Rose is large-display and image-duotone only; Rose Deep carries any rose that is text or state
on paper; Rose Light does the same on noir. Ochre belongs to the cover and nothing else. No third UI
color; extra color comes from the framed document, not the chrome.

## 3. Typography

**Display Font:** Anton (condensed black grotesque)
**Body / UI Font:** Space Grotesk
**Label / Mono Font:** IBM Plex Mono

**Character:** Anton is a single-weight condensed grotesque that reads ultra-black at size, the
"FIGHT / AKIRA" poster headline of the references. It is loud on purpose and used sparingly. Space
Grotesk is a slightly mechanical grotesque that keeps the UI raw, confident, and fully legible at
working sizes. IBM Plex Mono handles everything that must be unambiguous, and the references lean on
monospace for exactly this, every caption, index, and code line. (All three load via Google Fonts CDN; `server.js` must allow `https://fonts.googleapis.com` in
`styleSrc` and `https://fonts.gstatic.com` in `fontSrc`, otherwise the stylesheet is silently CSP-
blocked and all three fall back to system fonts with no visible error. System fallbacks remain the
no-FOUT baseline.)

### Hierarchy
- **Display** (Anton, clamp(2.5rem, 8vw, 6rem), lh 0.9, UPPERCASE): the wordmark, the empty-state
  hero, and noir poster headlines only. Never below roughly 2rem; condensed black is illegible at UI
  size, especially for aging eyes.
- **Headline** (Space Grotesk 600, clamp(1.15rem, 2.4vw, 1.5rem), lh 1.1): panel titles, the active
  document name. Grotesque, not Anton, so panel titles stay legible.
- **Title** (Space Grotesk 600, 0.95rem, lh 1.2): section labels, tab labels, button-adjacent headings.
- **Body** (Space Grotesk 400, 0.9rem, lh 1.5): general UI text, descriptions, toasts. Cap at 70ch.
- **Label** (IBM Plex Mono 500, 0.72rem, 0.06em, UPPERCASE): button text, badges, the meta line under
  composition cards, code numbers, keyboard hints.

### Named Rules
**The Mono-for-Truth Rule.** Anything that must be exact is set in IBM Plex Mono: page numbers, the
citation and cover counts, file names, export filenames, dimensions, packaging mode, and the
poster-furniture code numbers (the "P.34 / 373" index marks). Prose and headings are never mono.

**The Display-Is-Loud Rule.** Anton is for the wordmark, the empty-state hero, noir poster headlines,
and the title band of each All Documents poster-card (where `clamp(1.3rem, 2.4vw, 1.75rem)` is the
minimum — still large, still uppercase, still functioning as a poster headline even at that scale).
It never drops into dense working UI, panel headers, or button labels; grotesque and mono handle
those. Its rarity — one Anton title per poster-card, one hero, one wordmark — is what gives it impact.

## 4. Elevation

The system is flat at rest. There are no blurred drop shadows anywhere. Depth is communicated by ink
rules and, for elements that genuinely lift (a dragged cover, an open modal, the active tab), a hard
solid offset shadow with zero blur, like a printed block standing proud of the bed.

### Shadow Vocabulary
- **Hard Lift** (`box-shadow: 4px 4px 0 <ink|paper|rose>`): the only shadow. On the bench the offset
  is ink. On noir, where ink would vanish, the offset is paper or loud rose. Solid, offset down-right,
  zero blur, on the open modal, the dragged cover overlay, and the pressed-out active control.

### Named Rules
**The Hard-Edge Rule.** Blur is forbidden in shadows. `box-shadow` with a non-zero blur radius and
`backdrop-filter: blur` are both banned. Depth is a solid offset or a heavier border, never a haze.
If it looks like frosted glass, it is wrong.

**The Grain-Is-Matte Rule.** Texture is matte print noise, not light. Grain is static, low-opacity,
and permitted on three surfaces only: the empty-state hero (noir), the All Documents grid wall
(noir), and the thumbnail image zones in the page list (ink field behind each page render). It never
sits behind reading or working text, never glows, and never touches any bench panel background — that
is the eye-strain the product exists to prevent. The shared `--grain` CSS token unifies the noise
quality across all three.

## 5. Components

Every component is square-cornered (0px, 2px max) and bounded or filled with ink (bench) or paper/rose
(noir). Nothing is a soft rounded card.

### Buttons
- **Shape:** rectangular, 0px corners. Mono uppercase label.
- **Primary:** ink fill, paper text, 10px 18px padding. Hover swaps the fill to Rose Deep (which keeps
  the paper label at AA). No size change, no glow.
- **Ghost:** paper fill, 2px ink border, ink text. Hover fills paper-deep. For Cancel and secondary.
- **Focus:** a 2px Rose Deep outline offset 2px, always visible on keyboard focus, never removed.

### Chips / Badges
- **Citation:** square, 2px ink border on paper, mono label. Selected: Rose Deep border plus a solid
  Rose Deep corner tag, and the page card gains a Rose Deep rule. The check glyph stays so state never
  relies on color alone.
- **Cover:** square, ochre fill with ink text, plus the star glyph. The one place ochre appears.

### Cards / Containers (page cards, composition cards)
- **Corner Style:** square (0px).
- **Background:** paper; the page-list well is paper-deep.
- **Shadow Strategy:** none at rest. The dragged cover overlay uses Hard Lift.
- **Border:** 2px ink. Selected citation: 2px Rose Deep. Cover: 2px ochre. The border is the state,
  not a tint wash.
- **Internal Padding:** 8px to 16px. Vary it; do not pad everything identically.

### Inputs / Fields / Selects
- **Style:** paper-deep fill, 2px ink border, square. Mono or grotesque value text.
- **Focus:** border shifts to Rose Deep (2px), plus the Rose Deep outline. No glow.
- **Disabled:** ink-soft text, paper-deep fill, no border emphasis.

### Navigation (tab bar)
- **Style:** file-folder tabs bounded by 2px ink rules, sitting on the panel edge. Title-cased grotesque.
- **States:** inactive is ink-soft on paper; active is ink on paper-deep with the bottom rule removed
  so the tab joins its panel.

### Graphic Furniture (the poster vocabulary, as real UI)
Borrowed from the references and used with restraint, never as decorative stickers:
- **Registration marks** (crosshair, plus, corner ticks, in ink at 1.5-2px) mark the corners of the
  composition bench and framed windows, the same ticks that frame the reference photos.
- **Code numbers** (IBM Plex Mono, ink-soft) label real values, never fake ones: `P.34` for a page,
  a citation count, an export index. The reference "373 / P2." marks become honest metadata.
- **The stamp** (2px ink box, mono uppercase, e.g. `ORIGINAL · COMPOSED`) appears once per export
  confirmation as the seal, echoing the "BCR." mark. One per surface, never repeated.
- **Wireframe line icons** (1.5px ink or rose strokes, the globe/sphere of the references) are
  permitted only on noir hero surfaces, at most one per surface.
- **Dingbats** (`<<<`, `>>>`, x) are allowed as section separators on noir only, never on the bench.

### Signature: The Empty State (Noir Poster)

The confirmed implementation of the empty-state hero. Key elements, all from the reference set:

- **Ground**: noir fill with SVG feTurbulence grain overlay (13% opacity, screen blend).
- **Frame**: 2px rule in a very dim rose-warm mid-tone, with corner registration ticks at all four
  corners (CSS pseudo-elements, 16px, matching the FIGHT/BCR reference windows exactly).
- **Header row** (inside frame, top): `PDF COMPOSER` left, `×01` right — IBM Plex Mono, 0.65rem,
  near-invisible dim color, the same micro-label treatment as the FALLING / FIGHT posters.
- **Headline**: Anton, `clamp(2.8rem, 9vw, 5.5rem)`, **rose** (loud), uppercase, lh 0.88. The
  AKIRA poster is the direct model: rose ink on charcoal, condensed black display, nothing else.
  Never paper/cream on noir for the hero — that is the wrong reference (editorial, not riso).
- **Subtext**: IBM Plex Mono, 0.72rem, very dim mid-tone, uppercase. Not paper; not readable accent.
  It recedes behind the headline intentionally.
- **CTA button**: rose fill, noir text, full-bleed rose on hover to rose-deep. The single active
  element on the poster surface — it must still read as a button, not a decorative block.
- **Footer row** (inside frame, bottom): `P.01 / SRC` left, wireframe globe SVG center (26px, rose-
  warm dim), `‹ ‹ ‹` right — furniture from the AKIRA/FALLING graphic vocabulary, used as honest
  metadata placeholders (source code, page index, dingbat run). One globe per surface; never more.

### Signature: All Documents — Shape Poster Wall

The All Documents tab is a navigational gallery of shape-poster cards, one per loaded document. It
is deliberately noir, not a bench surface, because navigation at this scale is a brand moment, not
dense reading.

- **Grid ground**: noir fill with `--grain` overlay. The dark, gritty wall is the visual container
  that makes the cream poster-cards read as gallery objects.
- **Poster-card image zone**: `aspect-ratio: 3/4`, dark ink fill with grain. A generated line-art
  moiré shape (3 variants keyed by list position: nested-ellipse funnel, coiled rounded-rect stack,
  rotating ellipse rosette) fills 88% of the zone in cream lines. Citation-accented docs use
  rose-light for their shape.
- **Poster-card title band**: cream paper fill with 2px ink top rule. Anton display type at
  `clamp(1.3rem, 2.4vw, 1.75rem)`, uppercase, lh 0.9. IBM Plex Mono summary line below.
- **Catalog code**: "P.0x" in IBM Plex Mono, dim-cream, top-left of the image zone.
- **Registration ticks**: CSS `::before`/`::after` corner ticks on each card (ink, 12px), matching
  the framed-window vocabulary of the reference posters.
- **No cover thumbnail**: the real cover page is not shown in the overview — the shape is the card's
  poster identity. The cover opens with the document (per-doc workspace).
- **References**: `73737c250f510dc0b9001853555e5d7e.jpg` (shape poster triptych) and
  `Techno Poster.jpg` (TRACE BACK) — see Section 7.

### Signature: The Frame Bench
The frame picker plus the live composition preview is the heart of the app, and it is where the
reference vocabulary and the product become one thing. The composed pages sit on paper-deep inside a
2px ink frame with **corner registration ticks**, the exact framed-window treatment of the reference
posters. The frame `<select>` and the upload control share one ink-ruled toolbar, a mono `P.N` code
number labels each window, and the cover overlay lifts with Hard Lift while dragged. Craft (the
frames) meets structure (the bench) meets the poster (the framing).

## 6. Do's and Don'ts

### Do:
- **Do** keep every working and reading surface on the light bench (paper + ink); reserve noir for the
  empty state, export confirmation, and the wordmark band.
- **Do** draw every separator and boundary as a 2px ink rule or a paper-deep tonal step.
- **Do** set every exact value (page numbers, counts, filenames, code marks) in IBM Plex Mono.
- **Do** keep corners square (0px, 2px maximum) on every surface.
- **Do** convey depth with the single Hard Lift shadow (solid offset, no blur) or a heavier border.
- **Do** keep rose under ~10% of any bench screen; use Rose Deep for any rose that is text or state on
  paper, Rose Light on noir, and keep ochre exclusively on the cover.
- **Do** double-encode state: selected citations and cover use color plus a glyph and a border, never
  color alone (color-blind and aging-eyes safe).
- **Do** treat grain, halftone, registration marks, code numbers, and the stamp as restrained, honest
  UI, real metadata and real corners, not stickers.

### Don't:
- **Don't** confuse the noir poster with dark-neon: no gradients, no glassmorphism, no glow or bloom.
  Noir is flat charcoal, flat rose, and matte grain. If it glows, it is wrong.
- **Don't** put grain, halftone, or condensed display behind dense reading or working text, or on any
  bench surface. Texture and Anton are hero-only.
- **Don't** use loud Rose for small text or state; that is Rose Deep (paper) or Rose Light (noir).
- **Don't** build soft generic-SaaS UI: rounded gray cards in identical grids, a single blue accent,
  hero-metric panels.
- **Don't** add literal skeuomorphism: faux leather, stitching, glossy buttons. Craft is structural.
- **Don't** use blurred shadows or `backdrop-filter: blur` anywhere.
- **Don't** use 1px light-gray hairlines as dividers; make them ink.
- **Don't** use pure `#000` or `#fff`. Ink, paper, and noir are all warm-tinted.
- **Don't** introduce a third UI accent color, or scatter furniture (more than one stamp, icon, or
  dingbat run per surface). The frames carry the color; restraint carries the poster.

## 7. Visual References

The confirmed reference set lives at:
`~/Library/Mobile Documents/com~apple~CloudDocs/Downloads Cloud/Design/`

Key images and what they confirm:

| File | Confirms |
|---|---|
| `5527648d92c47b0bbb626422348242da.jpg` (AKIRA full) | Rose as the ONLY ink on charcoal; heavy grain throughout; framed image windows |
| `poster/generated_image_2025-08-01_05-06-29_3.png` (AKIRA clean) | Rose duotone over halftone image; rose Anton headline |
| `maxresdefault-gigapixel…jpg` (FIGHT/BCR) | Framed image windows with corner ticks; code numbers P2./3÷3; stamp BCR.; header/footer mono labels |
| `058bb1215369813.676a3c54725d4.webp` (FALLING/DESCEND) | Massive Anton headline; ××× / <<< dingbat runs; wireframe globe icon; barcode furniture; stamp |
| `poster/generated_image_2025-08-01_05-06-29_2.png` (rose icon set) | The rose wireframe icon vocabulary on charcoal: globe, crosshair, waveform, bar chart |
| `_.jpeg` (halftone fabric) | The grain/halftone texture quality: photocopy riso noise, not digital noise |
| `73737c250f510dc0b9001853555e5d7e.jpg` (shape posters) | Dark grain wall + cream poster-cards: the All Documents grid structure. Line-art moiré shapes as poster image zone. Anton headline filling the type band. Catalog codes + registration ticks as furniture. |
| `Techno Poster.jpg` (TRACE BACK) | Ink/grain dark field as the thumbnail placeholder zone (page list `page-thumb` + overview image zone). High-contrast photo mounted on dark ground. Heavy type corner codes. |

**What the references collectively rule out:**
- Headline in paper/white on noir (that is editorial/Helvetica, not riso)
- Grain as decorative only — it must cover the full dark field
- Globe or furniture icons on the paper bench — noir surfaces only
- Gradient or glow on the rose — it is flat ink, full stop
