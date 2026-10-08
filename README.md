# Tibetan Self-Immolations: A Visual Record

An interactive, scrolling timeline of the 157 Tibetans recorded by the Central Tibetan Administration (CTA) as having self-immolated in protest between February 2009 and March 2022. Each person appears as a small floating lamp showing their name and date. Select a lamp to open their full record: date, age, place, monastery or village, parents, reported outcome, review notes and sources.

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
    ├── index.html                page structure
    ├── styles.css                all styling, layout, animation
    ├── app.js                    all behaviour (timeline, filters, detail panel, embers)
    ├── data/
    │   ├── records.json          GENERATED merged dataset (also linked as a download)
    │   └── records.js            GENERATED same data as `window.VISUAL_RECORD = …`
    └── portraits/
        └── portraits.json        registry for verified portraits (empty for now)
```

Files under `site/data/` are generated. Edit `data/` or `research/`, then re-run the build script.

The earlier prototype in `sites/visual-record/` was removed. It loaded a `data/records.json` file that never existed, so it showed no records. Everything it did is covered by `site/`.

## What the page shows

### 1. Opening section
- **Headline figures**, computed from the data: people (157), reported dead (136), women (25), people in 2012 (85).
- **Dot histogram**: one dot is one person, stacked by year. Filled amber dots are people who died; hollow dots are everyone else. Select any year's column (click, or Tab then Enter) to scroll to that year.

### 2. Find bar (stays at the top while scrolling on wider screens)
- **Search** by name, alias, place, monastery or province. Accents are ignored.
- **Outcome chips**: Everyone, Died, Survived, or Custody / injured / unknown. Each shows its count.
- **Province** menu: Sichuan, Qinghai, Gansu, Tibet Autonomous Region, Beijing.
- Lamps that don't match fade out but keep their place, so the shape of the timeline stays readable. The status line gives the match count and a link to the first match.

### 3. The timeline (main visualization)
- A vertical **time spine** runs down the left. Years are large numerals that stay pinned while you scroll through that year. Months are ticks on the spine.
- Each **person is a lamp**: a circle with their portrait (or initials until a portrait is added), their name, and the day and month.
- **Ring style shows the reported outcome**:
  - glowing amber ring: died
  - pale green ring: survived (released or recovering)
  - dashed grey ring: in custody, injured with no later report, or unknown
- **Dashed outline around several lamps**: people who protested on the same day in the same place (148 incidents for 157 people).
- **Empty stretches** are kept and labelled ("Apr – Oct · no one recorded"; "No one recorded in this table in 2020"), so gaps in time remain visible. A gap means no row in this table, not proof that nothing happened.

### 4. Motion and floating effects
| Effect | How it works | Where |
| --- | --- | --- |
| Floating lamps | Each lamp drifts up and down on its own CSS animation (`@keyframes drift`). Duration (5.5–9.5 s), phase and vertical offset come from a hash of the record id, so the layout looks organic but is the same on every visit. | `styles.css` `.lamp`; `app.js` `nodeHTML` |
| Lamps light as you pass | An `IntersectionObserver` adds `.lit` to lamps in the middle of the screen. Lit lamps glow amber (or green, or grey by outcome), and the initials brighten. | `app.js` "Scroll" section |
| Hover lift | A lamp rises and enlarges slightly on hover or keyboard focus; its float pauses. | `.node:hover .lamp` |
| Rising embers | A full-screen `<canvas>` behind the page draws slow, soft amber particles. They move with scroll at different depths (parallax). Drawing pauses when the tab is hidden. | `app.js` `embers()` |
| Year rail | On screens 1100 px and wider, a rail on the right lists every year with a bar sized to its count. It highlights the year you are in, and clicking scrolls there. On smaller screens, a small badge in the corner shows the current year and count. | `#rail`, `#now` |
| Panel slide | The detail panel slides in from the right (from the bottom on phones). | `.drawer` |

If the visitor's system asks for **reduced motion**, floating, embers, smooth scrolling and slides are all switched off; everything stays readable.

### 5. Detail panel (click any lamp)
- Large portrait or initials, name, any aliases, and an outcome badge.
- Date of protest. If it was corrected, the CTA value is shown underneath.
- Age (marked as approximate when the source gives "20s", "late 30s", etc.), gender, province, place of protest, monastery, village or occupation, and parents when recorded.
- For people who died: the date of death and the number of days after the protest.
- **Same day, same place**: buttons that jump to the others in the same incident.
- **Notes on this record**: every correction, with the original value, the value used, the evidence, and its certainty; date checks; transcription notes.
- **Sources**: the CTA fact sheet plus each supporting report.
- The CTA's original date and status text, word for word.
- **Navigation**: Earlier / Later buttons or the ← → keys move through people in date order, and Esc closes the panel. The address updates to `#cta-007` and so on, so a link opens straight to that person.

### 6. About section
States the scope (the CTA table only), the ICT totals (159 inside Tibet and China plus 11 in exile), what isn't included yet, and how outcomes should be read. It links to the merged JSON.

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
3. Run `python3 scripts/build_records.py`. The lamp, the panel and the credit line update automatically. Portraits show in muted, warm grayscale to match the page.

## Design notes
- **Concept**: a vigil. Butter-lamp light on a deep umber night, with monastic maroon for the spine and rules. The page uses one deliberate dark theme.
- **Type**: Cormorant Garamond for names and years, Instrument Sans for reading, JetBrains Mono for dates and labels (Google Fonts, with system fallbacks).
- **Accessibility**: every lamp is a real button with a spoken label (name, date, outcome); the histogram columns and year rail are keyboard-operable; the panel keeps focus inside while it is open and returns focus to the lamp when it closes. The layout works down to phone width without sideways scrolling.

## Known limits and next steps
- Covers the **CTA table only**. Still to add: the 11 exile cases listed by ICT (including Thubten Ngodrup, Delhi, 1998, and Lobga Rangzen, New York, 2026) and the 30 March 2022 RFA report of Tsering Samdup.
- Two date conflicts are flagged and left unchanged: Sangdak (cta-107) and Tadin Kyab / Tamdrin Kyab (cta-083).
- Outcomes are what was reported at the time, not current status.
- Province is derived from free text. A map view would need verified coordinates with stated precision (see `research/SOURCES.md`, rule 6).
