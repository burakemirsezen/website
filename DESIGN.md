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
    lineHeight: 1.6
    fontFeature: "lnum"
  label:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.6
  small:
    fontFamily: "Public Sans Variable, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
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
  page-gutter: "clamp(1.25rem, 5vw, 3rem)"
  column-gap: "2.5rem"
  when-rail: "13rem"
  container: "72rem"
  section-sm: "3rem"
  section-lg: "clamp(3.5rem, 8vw, 6rem)"
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

**The Quiet Hover Rule.** On the charcoal band, buttons hover to cream (`on-band` fill, `charcoal-band` text), not to the signal. Nav links and the Contact pill are the exception: they hover to the signal.

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
- **Body** (400, 1.0625rem, line-height 1.6, bullets capped at 42rem): everything else.
- **Label** (700, 1rem): small headings such as "Right now", "The setup" and "Favourite records", always above a 2px rule.
- **Small** (0.9375rem / 0.875rem): nav links, metadata, captions, the build line.

### Named Rules
**The Weight Ladder Rule.** Hierarchy comes from weight and size, never from colour or uppercase: 800 for titles, 650 to 700 for entries, labels and actions, 400 for reading.

**The Pretty Wrap Rule.** Headings use `text-wrap: balance`; leads and bullets use `text-wrap: pretty`. Never ship a one-word last line in a heading.

## Layout

A centred container of 72rem with a fluid gutter (`page-gutter`). The page is one long column of full-bleed bands and paper sections.

- **Hero:** a 1.55fr / 1fr grid. The name, summary and actions sit on the left; the portrait and the "Right now" list sit on the right, aligned to the bottom. Its bottom padding is extra deep, because the first product screenshot overlaps the band edge from below.
- **Showcase:** a 1.45fr / 1fr grid of screenshots and text. A second, smaller screenshot overlaps the lower-right corner of the first.
- **List sections:** above 60rem, a two-column grid: a 13rem left rail holds the sticky section title, and the entries fill the rest. Each entry is a two-column grid of title/details and a right-aligned 13rem date column. Below 44rem, the dates move above the title.
- **Cluster:** two horizontal chains of nodes joined by connectors. Below 44rem they stack vertically and the connectors turn vertical. The fact list has two columns above 60rem and one below.
- **Music:** records and gear share a four-column grid, two columns below 60rem.
- **Rhythm:** sections are separated by a 2px ink rule drawn inside the gutter, so it lines up with the text, never edge to edge. A section that follows a band needs no rule.
- Breakpoints: 60rem (grids collapse) and 44rem (rows stack, the nav drops its secondary links).

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
- Section links: 0.9375rem, weight 600, no underline. On hover they turn signal with a 2px underline.
- Contact: an outlined pill on the right that fills with the signal on hover.
- On phones the links scroll sideways instead of wrapping, and the secondary links (Education, Skills) are hidden.

### Go links
A link with an arrow, used for every outbound "see it" link on the paper. Burnt orange, weight 650, padded to give a tap target. On hover the underline thickens from 1px to 2px and the arrow slides 0.2em to the right.

### Entries
A row in a list section: title (Entry style), organisation in muted text, dash bullets, an optional row of go links, and the date in a right column with tabular figures. Entries are separated by 1px paper-seam rules, with no boxes and no backgrounds.

### Screenshots
Linked product screenshots with the Screenshot shadow and 0.75rem corners. They lift 6px on hover over 500ms. On focus they get a 3px signal ring with a dark band inside, which shows up on every ground.

### Cluster chain (signature)
A row of nodes that shows a real path through the infrastructure.
- Nodes on the home cluster are solid (`node-home` fill, `node-home-edge` border). Nodes outside it have a dashed `node-outside-edge` border. A legend explains the two.
- In the live request path the borders warm toward the signal, the last node ("This page") is filled with the signal, and the connectors are dashed signal lines that flow continuously.
- Extra facts sit behind a `details` disclosure ("More about the setup"), whose summary turns signal on hover.

### Record sleeve (signature)
A square sleeve with a CSS-drawn vinyl disc peeking out on the right. On hover or focus the disc slides further out. The cover photo fills the sleeve; behind it, the sleeve colour cycles through dark umber, charcoal, signal and `sleeve-paper`, and also tints the disc label. The whole record links to the album. Below it sit the title (1.125rem), the artist in muted text, and a "Listen on Spotify" arrow that slides when the record is hovered.

### Gear tile
A product cut-out photo on a faint ink-tinted square tile (7% ink), so dark gear stays visible on the dark theme. The title and description sit below it.

### Placeholder slot
A missing photo shows as a dashed muted border over a fine diagonal hatch, with a plain label. Unwritten text is italic with a dashed underline. Placeholders are meant to look unfinished.

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

### Don't:
- **Don't** add a second accent colour, gradients, or coloured section backgrounds beyond the charcoal band.
- **Don't** use cards, boxed entries or shadows for text content.
- **Don't** add a second typeface. Monospace is only for code and hashes.
- **Don't** use uppercase labels or letter-spaced eyebrows. Hierarchy comes from weight.
- **Don't** make the dark-mode band darker than the ground.
- **Don't** invent metrics, logos or testimonials to fill space. Use a visible placeholder instead.
