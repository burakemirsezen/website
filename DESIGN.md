---
name: bsezen.com
description: Personal site of Burak Emir Sezen. Warm paper, charcoal bands, one ember signal.
colors:
  charcoal-band: "#211f1d"
  charcoal-band-dark: "#2a2724"
  on-band: "#f6f3ec"
  on-band-soft: "#c2bbaf"
  band-line: "#4a443e"
  band-line-dark: "#524b44"
  ember-signal: "#e8693a"
  on-signal: "#1c1917"
  warm-paper: "#f6f3ec"
  warm-paper-dark: "#131211"
  ink: "#292524"
  ink-dark: "#f1ede4"
  muted: "#57534e"
  muted-dark: "#b0a99d"
  rule: "#ddd8ce"
  rule-dark: "#34302c"
  burnt-link: "#b03c0e"
  burnt-link-dark: "#f0916a"
  node-home: "#3a3530"
  node-home-edge: "#c2bbaf"
  node-outside-edge: "#8a8177"
  node-live-edge: "#9c5a3c"
  sleeve-paper: "#e7e1d5"
typography:
  display:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "clamp(3rem, 9.5vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.94
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "clamp(2rem, 4.5vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2.4vw, 1.75rem)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  entry:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  lead:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "clamp(1.15rem, 2vw, 1.3rem)"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "lnum"
  label:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.5
  small:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "ui-monospace, Cascadia Mono, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.95em"
    fontWeight: 400
rounded:
  focus: "2px"
  sleeve: "3px"
  key: "0.2rem"
  md: "0.5rem"
  shot: "0.75rem"
  pill: "999px"
spacing:
  3xs: "0.25rem"
  2xs: "0.5rem"
  xs: "0.75rem"
  s: "1rem"
  m: "1.5rem"
  l: "clamp(1.75rem, 1.5rem + 1vw, 2.25rem)"
  xl: "clamp(2rem, 1.5rem + 2.5vw, 3rem)"
  2xl: "clamp(2.5rem, 1.75rem + 3.75vw, 4rem)"
  section: "clamp(2.5rem, 2rem + 2.5vw, 3.5rem)"
  section-lg: "clamp(3.5rem, 2.5rem + 5vw, 6rem)"
  page-gutter: "clamp(1.25rem, 5vw, 3rem)"
  rail: "13rem"
  container: "72rem"
components:
  button-primary:
    backgroundColor: "{colors.ember-signal}"
    textColor: "{colors.on-signal}"
    rounded: "{rounded.pill}"
    padding: "0.7rem 1.15rem"
  button-primary-hover:
    backgroundColor: "{colors.on-band}"
    textColor: "{colors.charcoal-band}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.on-band}"
    rounded: "{rounded.pill}"
    padding: "0.7rem 1.15rem"
  button-outline-hover:
    backgroundColor: "{colors.on-band}"
    textColor: "{colors.charcoal-band}"
  nav-link:
    textColor: "{colors.on-band}"
    typography: "{typography.small}"
    padding: "0.7rem 0.15rem"
  nav-contact:
    textColor: "{colors.on-band}"
    rounded: "{rounded.pill}"
    padding: "0.7rem 0.95rem"
  nav-contact-hover:
    backgroundColor: "{colors.ember-signal}"
    textColor: "{colors.on-signal}"
  link-go:
    textColor: "{colors.burnt-link}"
    padding: "0.5rem 0"
  chain-step:
    textColor: "{colors.on-band}"
    rounded: "{rounded.md}"
    padding: "0.85rem 0.9rem"
  chain-step-home:
    backgroundColor: "{colors.node-home}"
    textColor: "{colors.on-band}"
    rounded: "{rounded.md}"
    padding: "0.85rem 0.9rem"
  chain-step-arrival:
    backgroundColor: "{colors.ember-signal}"
    textColor: "{colors.on-signal}"
    rounded: "{rounded.md}"
    padding: "0.85rem 0.9rem"
  gear-tile:
    rounded: "{rounded.md}"
    padding: "11%"
  record-sleeve:
    backgroundColor: "{colors.charcoal-band}"
    textColor: "{colors.on-band}"
    rounded: "{rounded.sleeve}"
---

# Design System: bsezen.com

## Overview

**Creative North Star: "The Signal Sheet"**

The site reads like a well-kept engineering record printed on warm paper and bound between charcoal covers. Charcoal bands open the page (hero), carry the infrastructure story (the cluster), and close it (contact). In between, warm paper holds the record itself: the work, the research, education and skills, each a dated entry separated by plain rules. Then one ember orange signal marks what is live or actionable: the main action, the moment you hover or focus, the last hop of the request that served this page.

The tone is calm and confident. Nothing is decorated for its own sake. Type does the work: one variable sans set very heavy and tight at display sizes, and relaxed and readable at body sizes. Imagery is real: product screenshots, a portrait, photos of the actual gear and records. Placeholders admit they are placeholders.

Density is moderate. The page is long and single-column on phones. On wide screens it opens into a two-column grid with a sticky left rail for section titles, so a hiring visitor can scan it in about a minute.

**Key Characteristics:**
- Three surfaces only: charcoal band, warm paper, and the ember signal.
- One typeface (Public Sans Variable), with weight and tracking setting the hierarchy.
- Flat surfaces separated by rules. Only physical objects (screenshots, record sleeves) cast shadows.
- Pill-shaped actions, gently rounded objects, square text structure.
- Motion is small and physical: things lift, discs slide, the live path flows.

## Colors

A warm, almost monochrome palette of paper and charcoal, with one hot accent.

### Primary
- **Ember Signal** (`ember-signal`): the only accent. Fills the primary button (the email address in the hero), the Contact pill on hover, focus rings on the charcoal band, text selection, the skip link, the arrival node and the moving dashes of the live request path, the footer email underline, and one record sleeve in every four. Text on it is always **Near-Black Umber** (`on-signal`).

### Neutral
- **Charcoal Band** (`charcoal-band`; `charcoal-band-dark` in dark mode): background of the sticky nav, hero, cluster section and footer. In dark mode it sits *above* the ground (lighter than it), so it still reads as a raised surface.
- **Band Cream** (`on-band`) and **Band Stone** (`on-band-soft`): primary and secondary text on the band.
- **Band Seam** (`band-line`; `band-line-dark`): rules and connectors inside the band.
- **Warm Paper** (`warm-paper`; `warm-paper-dark`): the page ground.
- **Umber Ink** (`ink`; `ink-dark`): body text and the 2px section rules.
- **Weathered Stone** (`muted`; `muted-dark`): dates, organisations, skill groups, bullet text in showcases.
- **Paper Seam** (`rule`; `rule-dark`): 1px dividers between entries.
- **Burnt Orange Link** (`burnt-link`; `burnt-link-dark`): inline links and "go" links on the paper. It is a darker or lighter version of the signal, toned to pass contrast on each ground.

### Cluster diagram
- **Node Home** (`node-home`, with `node-home-edge`): solid nodes for things that run on the home cluster.
- **Outside Edge** (`node-outside-edge`): dashed outline for nodes outside the cluster.
- **Live Edge** (`node-live-edge`): dashed outline on the live request path, warming toward the signal.

### Named Rules
**The One Ember Rule.** The signal is the only saturated colour on the page. It marks the main action, interaction states, and live things. It never fills a section, a card or a heading.

**The Quiet Hover Rule.** Hover always raises contrast, never lowers it. On the charcoal band, buttons hover to cream (`on-band` fill, `charcoal-band` text). Text links on the band keep their cream text and gain a 2px signal underline; orange text on charcoal is lower contrast than cream. The Contact pill is the one signal fill, since its dark text on the signal stays above 5:1.

**The Raised Band Rule.** In dark mode the band is lighter than the ground (`#2a2724` over `#131211`), never darker. A band must always read as a separate surface.

## Typography

**Display Font:** Public Sans Variable (with system-ui, sans-serif)
**Body Font:** Public Sans Variable
**Mono Font:** the system monospace stack, used only for the commit hash in the footer

**Character:** One sturdy sans covers everything. The display sizes are set very heavy and tight (800 weight, negative tracking), so the name and section titles look stamped on the page. The body is open and plain. Numbers use lining figures; dates use tabular figures so they line up.

### Hierarchy
- **Display** (800, clamp 3rem to 6rem, line-height 0.94, -0.04em): the name in the hero only. It rises in once on load.
- **Headline** (800, clamp 2rem to 3rem, line-height 1.05, -0.03em, balanced): titles of the feature sections (platforms, cluster, music).
- **Title** (800, clamp 1.5rem to 1.75rem, line-height 1.15, -0.025em): titles of the list sections (Work, Research, Education, Skills), pinned in the left rail on wide screens.
- **Entry** (650, 1.25rem, line-height 1.3): the name of a role, project or degree.
- **Lead** (400, clamp 1.15rem to 1.3rem, line-height 1.45, max about 40 to 44rem): the opening paragraph of a section, and the hero summary.
- **Body** (400, 1.0625rem, line-height 1.5, bullets capped at 42rem, which keeps lines at 60 to 80 characters): everything else.
- **Label** (700, 1rem): small headings such as "Right now", "The setup" and "Favourite records", always above a 2px rule.
- **Small** (0.9375rem / 0.875rem): nav links, metadata, captions, the build line.

### Named Rules
**The Weight Ladder Rule.** Hierarchy comes from weight and size, never from colour or uppercase: 800 for titles, 650 to 700 for entries, labels and actions, 400 for reading.

**The Pretty Wrap Rule.** Headings use `text-wrap: balance`; leads and bullets use `text-wrap: pretty`. Never ship a one-word last line in a heading.

## Layout

A centred container of 72rem with a fluid gutter (`page-gutter`). The page is one long column of full-bleed bands and paper sections.

- **Hero:** a 1.55fr / 1fr grid. The name, summary and actions sit on the left; the portrait and the "Right now" list sit on the right, aligned to the bottom. Its bottom padding is extra deep, because the first product screenshot overlaps the band edge from below.
- **Showcase:** a 1.45fr / 1fr grid of screenshots and text. A second, smaller screenshot overlaps the lower-right corner of the first. The Visit row swaps sides on wide screens. Once stacked, both platforms show the screenshot first, then the text.
- **List sections:** above 60rem, a two-column grid: a 13rem left rail holds the sticky section title, and the entries fill the rest. Each entry is one column: the date as a small muted line, then the title, organisation, bullets and links. There is no separate date column, so the text keeps its full width.
- **Cluster:** two horizontal chains of nodes joined by connectors. Below 44rem they stack vertically and the connectors turn vertical. The fact list has two columns above 60rem and one below.
- **Music:** records and gear share a four-column grid, two columns below 60rem.
- **Rhythm:** sections are separated by a 2px ink rule drawn inside the gutter, so it lines up with the text, never edge to edge. A section that follows a band needs no rule.
- Breakpoints: 60rem (grids collapse) and 44rem (rows stack, the nav drops its secondary links).

### Spacing scale

Every gap between blocks is one step of the scale in the frontmatter (`3xs` to `2xl`). The steps from `l` up grow with the window. Values smaller than `3xs`, or inside a component's padding, are optical nudges and tap targets, not rhythm.

- **Two section rhythms.** List sections (Work, Research, Education, Skills) pad by `section` above and below. Feature sections and bands (showcase, cluster, music, footer) pad by `section-lg`. Bigger headings get more room.
- **Inside a block:** heading to lead is `s`, lead to bullets is `m`, bullets to links is `xs` to `s`. Bullet to bullet is `2xs`. Entry to entry is `m` on each side of the rule.
- **Between blocks inside a section:** `xl` to `2xl`, such as between the lead and the cluster paths, or between the records and the gear.

**The Ladder Rule.** New spacing takes a step from the scale. If no step fits, the layout is wrong, not the scale.

**The Heading Leads Rule.** There is always more space above a heading than below it, so the heading belongs to what follows it.

## Elevation & Depth

The page is flat. Surfaces are separated by colour (band against paper) and by rules, not by shadows. Shadows belong only to things that behave like physical objects: product screenshots and record sleeves. Those objects also lift on hover.

### Shadow Vocabulary
- **Screenshot** (`0 1px 2px rgb(20 14 8 / 0.25), 0 18px 40px -12px rgb(20 14 8 / 0.45), 0 40px 80px -30px rgb(20 14 8 / 0.5)`): a deep, warm-tinted drop under the product screenshots. In dark mode a 1px `#3a3531` edge is added, so a dark screenshot doesn't merge into the dark ground.
- **Sleeve** (`0 1px 2px rgb(20 14 8 / 0.3), 0 12px 24px -12px rgb(20 14 8 / 0.55)`): a shorter drop under the record sleeves.

### Named Rules
**The Objects Lift Rule.** Only real objects get shadows. Text blocks, entries, nav, and sections never do. If something new isn't a picture of a thing, it stays flat.

**The Warm Shadow Rule.** Shadows are tinted toward umber (`rgb(20 14 8 / …)`), never neutral grey or blue-black.

## Shapes

There are three kinds of corner:
- **Pills** (999px): every action you press, such as the hero buttons and the Contact link.
- **Gentle rounding** (0.5rem to 0.75rem): images and objects. That covers the portrait, the gear tiles, the cluster nodes, and the screenshots (0.75rem).
- **Near-square** (2px to 3px): record sleeves and focus rings, which echo real printed objects.

Text structure is always square: rules are straight lines, entries have no boxes. Bullets are short 0.5rem dashes, not dots. The "go" arrow is a rotated bordered square drawn in CSS, so it matches the text colour and weight.

## Components

### Buttons
Tactile pills. They lift 2px on hover and settle on press.
- **Shape:** fully rounded (999px), 1.5px border, weight 650.
- **Primary** (one per view, the email address): ember fill and umber text.
- **Outline** (GitHub, LinkedIn): transparent with a cream border and cream text.
- **Hover:** both fill with cream and take charcoal text (see The Quiet Hover Rule). The change runs over 200ms on the shared ease-out curve.
- **Focus:** a 2px signal ring, offset 3px.

### Navigation
A sticky charcoal bar the same colour as the hero, so it only reads as a bar once you scroll.
- Section links: 0.9375rem, weight 600, no underline. On hover they keep their cream text and gain a 2px signal underline (The Quiet Hover Rule).
- Current section: while a section crosses a line a third of the way down the window, its link gets `aria-current="location"`: cream text on a 2px signal underline. No link is marked over the hero, the music section or the footer.
- Contact: an outlined pill on the right that fills with the signal on hover.
- On phones the links scroll sideways instead of wrapping, and the secondary links (Education, Skills) are hidden.

### Go links
A link with an arrow, used for every outbound "see it" link on the paper. Burnt orange, weight 650, padded to give a tap target. On hover the underline thickens from 1px to 2px and the arrow slides 0.2em to the right.

### Entries
A row in a list section: the date first (0.9375rem, muted, tabular figures), then the title (Entry style), the organisation in ink (not muted: a scan of the titles alone reads "Software Engineer" twice, and the organisation tells them apart), dash bullets, and an optional row of go links. Entries are separated by 1px paper-seam rules, with no boxes and no backgrounds.

### "Right now" list
In the hero, under the portrait: a "Right now" label with "Updated <month>" on the right, above a 2px cream rule. Then one row per current role, each with a 1px rule. The update month lives in `nowUpdated` in `src/data/site.ts`; change it whenever the list changes.

### Link preview image
`public/og.png` (1200×630) is what LinkedIn, Slack and messengers show for a shared link. It has the name in Display style on the charcoal band, a 112px ember rule above it, the tagline in Band Stone, and the domain. Regenerate it with `node scripts/og-image.mjs` after changing the name or tagline.

### Icons
Three files cover browsers, tools and home screens: `favicon.svg` (the cream B on a charcoal rounded square), `favicon.ico` (32×32) and `apple-touch-icon.png` (180×180, full-bleed square; iOS rounds the corners itself). The SVG is the source; regenerate the other two with `node scripts/icons.mjs`.

### Screenshots
Linked product screenshots with the Screenshot shadow and 0.75rem corners. They lift 6px on hover over 500ms. On focus they get a 3px signal ring with a dark band inside, which shows up on every ground.

### Cluster chain (signature)
A row of nodes that shows a real path through the infrastructure.
- Nodes on the home cluster are solid (`node-home` fill, `node-home-edge` border). Nodes outside it have a dashed `node-outside-edge` border. A legend explains the two.
- In the live request path the borders warm toward the signal, the last node ("This page") is filled with the signal, and the connectors are dashed signal lines that flow continuously.
- Extra facts sit behind a `details` disclosure ("More about the setup"). Its summary gains a signal underline on hover. The browser triangle is replaced by the same drawn chevron as the go links, pointing down when closed and up when open. Where the browser supports `interpolate-size` and `::details-content`, the facts slide open over 400ms; elsewhere they simply appear. Reduced motion turns the slide off.

### Record sleeve (signature)
A square sleeve with a CSS-drawn vinyl disc peeking out on the right. On hover or focus the disc slides further out. The cover photo fills the sleeve; behind it, the sleeve colour cycles through dark umber, charcoal, signal and `sleeve-paper`, and also tints the disc label. The whole record links to the album. Below it sit the title (1.125rem), the artist in muted text, and a "Listen on Spotify" arrow that slides when the record is hovered.

### Gear tile
A product cut-out photo on a faint ink-tinted square tile (7% ink), so dark gear stays visible on the dark theme. The title and description sit below it.

### Placeholder slot
A missing photo shows as a dashed muted border over a fine diagonal hatch, with a plain label. Unwritten text is italic with a dashed underline. Placeholders are meant to look unfinished.

### Motion and texture

The hero sets line by line, the ember rule draws in, then the summary, buttons and "Right now" rise. Below, entries and blocks reveal and section rules draw as they enter (CSS scroll-driven animation, static where unsupported), a thin ember line in the nav tracks scroll, and the nav underline grows in. Screenshots tilt a few degrees toward the pointer (`src/scripts/fx.ts`, mouse only). The hero and footer carry a 6% SVG paper grain. A short ember tab marks every section rule and the footer, echoing the rule under the name. All motion is off under `prefers-reduced-motion`. Focus rings use the link colour.

### Print
Recruiters save pages as PDF, so print is designed, not left to chance. Print always uses the light palette on white, whatever the screen theme. The bands drop their fill and their light text switches to ink. The nav, skip link, second screenshot and Spotify links are hidden. Buttons and footer links print as text followed by their address, and research links print their address in brackets. The portrait is capped at 20rem. The cluster facts behind the disclosure print even when it is closed. Entries, fact rows, chains, figures and screenshots never split across pages, and headings stay with what follows them. Page margins are 16mm by 14mm.

## Do's and Don'ts

### Do:
- **Do** keep the ember signal for the main action, interaction states and live things only (The One Ember Rule).
- **Do** put text on the signal in `on-signal` umber, never white.
- **Do** separate sections with the 2px ink rule inside the gutter, and entries with 1px paper-seam rules.
- **Do** use real screenshots and photos, and the dashed slot when a photo is missing.
- **Do** set every new heading in Public Sans Variable at 650 to 800 weight with negative tracking, and balance its wrap.
- **Do** tint shadows warm and give them only to objects (The Objects Lift Rule).
- **Do** use the shared ease-out curve (`cubic-bezier(0.16, 1, 0.3, 1)`), and turn off every transition and animation under `prefers-reduced-motion`.
- **Do** give every focusable element a visible ring: currentColor on paper, the signal on the band.
- **Do** glue a short last word to the one before it with a non-breaking space (`this page.` in the hero summary), so no paragraph ends on one stranded word. Keep curly quotes, real dashes and the ellipsis character in copy.
- **Do** check print (or Save as PDF) after layout changes: light palette, link addresses visible, nothing split across pages.
- **Do** keep page scripts as separate files. nginx sends a Content-Security-Policy that blocks inline scripts, so `astro.config.mjs` sets Vite's `assetsInlineLimit` to 0. A script that works in dev but not in production is probably being inlined.
- **Do** keep every link and button at least 24×24px (WCAG 2.2, 2.5.8). Go links and nav links get there with vertical padding.
- **Do** keep the first paint fast. On desktop the largest paint on load is the hero name, so the Public Sans latin file is preloaded. On phones it's the portrait, which carries `fetchpriority="high"`. Anything new above the fold must not push either back.

### Don't:
- **Don't** add a second accent colour, gradients, or coloured section backgrounds beyond the charcoal band.
- **Don't** use cards, boxed entries or shadows for text content.
- **Don't** add a second typeface. Monospace is only for code and hashes.
- **Don't** use uppercase labels or letter-spaced eyebrows. Hierarchy comes from weight.
- **Don't** make the dark-mode band darker than the ground.
- **Don't** invent metrics, logos or testimonials to fill space. Use a visible placeholder instead.
