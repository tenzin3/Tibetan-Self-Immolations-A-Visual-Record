# Tibetan Self-Immolations: A Visual Record

An interactive radial graph of the 157 Tibetans recorded by the Central Tibetan Administration (CTA) as having self-immolated in protest between February 2009 and March 2022. Each person is a circle holding their photo (or initials until a photo is added), with their name and date underneath. Every circle has a line to one shared centre. You can drag, zoom and rotate the whole graph, and selecting a person opens their full record.

## Quick start

Open the page directly. No server or install is needed.

```
site/index.html      ← double-click, or drag into a browser
```

If you change the data, rebuild it first (Python 3, standard library only):

```
python3 scripts/build_records.py
```

To serve it locally instead (optional): `cd site && python3 -m http.server 8000`, then open http://localhost:8000.

## Project layout

```
.
├── README.md                     this file
├── data/
│   ├── cta-records.json          SOURCE: 157 rows transcribed from the CTA fact sheet
│   └── source-reported-counts.json   published totals from CTA and ICT (not reconciled)
├── research/
│   ├── SOURCES.md                source review, cautions and rules for the record
│   └── date-corrections.json     15 reviewed corrections + 4 additional date checks
├── scripts/
│   └── build_records.py          merges the source data and corrections into site/data/
└── site/                         the visualization (static files, no build tools)
    ├── index.html                page structure (SVG graph, panels, record panel)
    ├── styles.css                all styling
    ├── app.js                    layout, camera (pan/zoom/rotate), motion, search, record panel
    ├── data/
    │   ├── records.json          GENERATED merged dataset (also linked as a download)
    │   └── records.js            GENERATED same data as `window.VISUAL_RECORD = …`
    └── portraits/
        └── portraits.json        registry for verified portraits (empty for now)
```

Files under `site/data/` are generated. Edit `data/` or `research/`, then re-run the build script.

The earlier prototype in `sites/visual-record/` was removed. It loaded a `data/records.json` file that never existed, so it showed no records. Everything it did is covered by `site/`. A first scrolling-timeline version of `site/` was then replaced by this radial graph.

## What the page shows

### The graph
- **Centre (hub)**: a glowing disc reading "157 lives, 2009 – 2022". Every person is linked to it. Select the hub to open *About this record*: people by year, how to read the graph, and the scope of the data.
- **People**: one circle per person, holding a portrait or initials. The **name** sits underneath, with the **date of the protest** below it.
- **Lines**: each person has one line to the centre. Lines curve slightly so the graph reads as a turning spiral. A person's line lights up amber when you hover over, focus, or select them.
- **Order is time**: people sit on a spiral. A dashed thread runs from the earliest (Tapey, February 2009), nearest the centre, out to the most recent (March 2022) at the edge. A wider gap opens before each new year, labelled with the year and its count (for example "2012, 85 people").
- **Ring shows the reported outcome**:
  - amber ring with a soft glow: died (136)
  - pale green ring: survived, released or recovering (7)
  - dashed grey ring: in custody, injured with no later report, or unknown (14)

### Moving around
| Action | Mouse / trackpad | Touch | Keyboard / buttons |
| --- | --- | --- | --- |
| Move (pan) | drag | one-finger drag | arrow keys |
| Zoom | scroll wheel, or trackpad pinch | pinch | `+` / `−`, or the + − buttons |
| Rotate | Shift + drag, or Shift + scroll; Safari trackpad rotate | two-finger twist | `[` / `]`, or the ⟲ ⟳ buttons |
| Slow automatic rotation | — | — | space, or the ❚❚ / ▶ button |
| Reset view | — | — | `0`, or the ⌂ button |
| Open a person | click | tap | Tab to a person, then Enter |

Zoom works around the pointer or pinch point. Rotation turns around the centre, or around the pinch point for a twist. **Level of detail:** fully zoomed out, only the circles show; zooming in reveals names, then dates.

### Motion
| Effect | How it works | Where in the code |
| --- | --- | --- |
| Opening move | The graph starts small and slightly turned, then drifts in to fill the screen (2.2 s). | `app.js`, "Start" |
| Slow rotation | The whole graph turns around the centre at about 2.6° per second. It pauses while you drag and while a record is open, and can be switched off. | `frame()`, `SPIN` |
| Floating | Every circle drifts a few pixels on its own slow orbit. Speed and phase come from a hash of the record id, so the motion looks organic and is the same on every visit. Lines follow their circle. | `frame()` |
| Upright labels | Names, years and the hub are counter-rotated every frame, so text stays level however the graph is turned. | `frame()` |
| Hover | A circle grows, glows and lights its line. | `styles.css`, `.node:hover` |
| Fly-to | Opening a person smoothly pans and zooms them to the middle of the visible area, beside the panel. | `flyTo()`, `viewFor()` |
| Embers | Soft amber particles rise in a background canvas and drift as you pan (parallax). | `embers()` |

When the visitor's system asks for **reduced motion**, the rotation, floating, opening move, fly-to and embers are all off. Everything else still works.

### Find
- **Search** (top right) matches names, aliases, places, monasteries, provinces and years; accents are ignored. Matching people stay bright, with bold rings and lines, and everyone else fades. Press Enter, or select "Show …", to fly to the first match.
- **Outcome chips**: Everyone, Died, Survived, or Custody / injured / unknown.

### Record panel (select anyone)
The panel shows:
- portrait or initials, name, aliases and an outcome badge
- date of protest, with the CTA value if it was corrected
- age (marked approximate when published as "20s" and similar), gender and province
- place of protest, monastery or village, and parents
- for people who died: the date of death and the number of days after the protest
- *Same day, same place*: links to the others from the same incident
- *Notes on this record*: every correction, with the original value, the value used, the evidence and its certainty
- *Sources*: every link behind the record

**Earlier / Later** (or ← →) walk through people in date order, and the graph flies to each one. Esc closes the panel. The address becomes `#cta-050` and so on, so a link opens straight to that person; `#about` opens the about panel.

## How the data is built (`scripts/build_records.py`)

1. Loads `data/cta-records.json` (157 records).
2. Applies `research/date-corrections.json`. Corrections are applied to `incident_date`, `death_date`, `incident_location` and `affiliation`. **The original CTA value is never discarded**: each applied correction stores `original`, `used`, `certainty`, `evidence` and `url`. The `additional_checks` (for example "retain 2013-02-25" or "unresolved") are attached as notes.
3. Parses the date of death from CTA status text in all its published forms (`Died on 6/4/2012`, `Died 13/3/2013`, `Died on 21/02/12`, `Died on 30 July 2012`, `Died in October 2018`). A month-only date is kept as month precision.
4. Classifies the outcome: `died`, `survived` (released or recovering), `custody`, `injured`, or `unknown`.
5. Derives the province from the place text. Province names in the text take priority; known place names are the fallback (Ngaba → Sichuan, Rebgong → Qinghai).
6. Groups people with the same date and place into an `event_id`, and lists who shared it.
7. Writes `site/data/records.json` and `site/data/records.js`, then prints summary figures.

Check the current build: 157 people, 148 incidents, 136 reported dead (matches CTA's published 136), 25 women and 131 men (one record has no gender marked; CTA's own headline says 26 women), 15 corrections applied.

### Record fields (`site/data/records.json` → `people[]`)

| Field | Meaning |
| --- | --- |
| `id` | `cta-` + CTA table position, e.g. `cta-007`. Stable; used in links. |
| `position` | Row position in the CTA table (CTA's own numbering repeats 119 and skips 109). |
| `name`, `aliases`, `initials` | Name as published, other recorded names, and initials for the placeholder. |
| `gender`, `age`, `age_is_approximate` | As published. Approximate ages stay as text. |
| `affiliation`, `location`, `region` | Monastery or village; place of protest; derived province. |
| `father`, `mother` | When recorded. |
| `date`, `date_as_published` | Date used (after review) and the CTA text. |
| `outcome`, `outcome_label`, `status_as_published` | Category, display label, and the CTA status text. |
| `death_date`, `death_date_precision`, `days_until_death` | Parsed or corrected date of death. |
| `corrections`, `checks`, `notes` | Review trail. |
| `sources` | Every URL behind the record. |
| `event_id`, `shared_with` | Incident grouping. |
| `portrait` | `null`, or `{file, credit, source_url}` from the portrait registry. |

## Adding portraits

The source data contains no photographs, and `research/SOURCES.md` requires each image to have its own provenance and reuse check. So the page shows initials until a verified portrait is registered. No portraits are generated.

1. Save the photo as `site/portraits/cta-007.jpg` (use the record id).
2. Add it to `site/portraits/portraits.json`:
   ```json
   "portraits": {
     "cta-007": {
       "file": "portraits/cta-007.jpg",
       "credit": "Photographer or publisher",
       "source_url": "https://page-where-it-was-published"
     }
   }
   ```
3. Run `python3 scripts/build_records.py`. The circle in the graph, the record panel and the credit line update automatically. Photos are cropped to a circle.

## Design notes
- **Concept**: a vigil. Butter-lamp amber on a deep umber night, with monastic maroon for the lines. The page uses one deliberate dark theme.
- **Type**: Cormorant Garamond for the title, years and hub; Instrument Sans for names and reading; JetBrains Mono for dates and labels. All come from Google Fonts, with system fallbacks.
- **Geometry** (top of the layout section in `app.js`): circle radius `NODE_R` 20, spacing along the spiral `S` 80, distance between turns `TURN` 92, inner radius `R0` 175, year gap `YEAR_GAP` 1.9×S. These values keep names from overlapping their neighbours.
- **Camera**: `screen = centre + offset + zoom · rotation · world`. All pan, zoom and rotate math is in `zoomAt()` and `rotateAt()`.
- **Accessibility**: every person is focusable, with a spoken label (name, date, outcome). The hub and all controls work from the keyboard. The record panel keeps focus inside while it is open and returns focus to the person when it closes. The layout works at phone width.

## Known limits and next steps
- Covers the **CTA table only**. Still to add: the 11 exile cases listed by ICT (including Thubten Ngodrup, Delhi, 1998, and Lobga Rangzen, New York, 2026) and the 30 March 2022 RFA report of Tsering Samdup.
- Two date conflicts are flagged and left unchanged: Sangdak (cta-107) and Tadin Kyab / Tamdrin Kyab (cta-083).
- Outcomes are what was reported at the time, not current status.
- Province is derived from free text. A map view would need verified coordinates with stated precision (see `research/SOURCES.md`, rule 6).
