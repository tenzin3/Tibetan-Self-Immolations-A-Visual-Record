# Historical data source review

Research date: October 8, 2026. Initial source discovery and spot checks; a complete person-by-person dataset has not yet been extracted or reconciled.

## Recommended sources

| Source | What it provides | Recommended role |
| --- | --- | --- |
| [International Campaign for Tibet (ICT): self-immolation fact sheet](https://savetibet.org/tibetan-self-immolations/) | Individual names, dates, ages, locations, reported outcomes, and links to case reports; separate section for exile cases. | Starting index for individual records. ICT is an advocacy organization; retain attribution and corroborate case details. |
| [Central Tibetan Administration (CTA): fact sheet](https://tibet.net/important-issues/factsheet-immolation-2011-2012/) | Numbered individual records, affiliations, ages, locations, outcomes, and annual totals. | Second list for matching names and identifying conflicting claims. CTA is the Tibetan administration in exile. |
| [Radio Free Asia (RFA): March 31, 2022 report](https://www.rfa.org/english/news/tibet/yushul-immolation-03312022125553.html) | Reporting on Tsering Samdup, also called Tsering, in Kyegudo/Jiegu, Yushu, Qinghai, on March 30, 2022. | Example of case reporting that supplements aggregate lists. RFA says his condition and motivation were unknown. |
| [ICT: historical map, 2009–2017](https://savetibet.org/why-tibet/self-immolations-by-tibetans/map-tibetan-self-immolations-from-2009-2013/) | Historical geographic coverage and annual figures for that edition. | Geographic reference; do not use its older totals as current figures. Its definition of Tibet includes Tibetan areas throughout the PRC. |

## Published totals and unresolved issues

- ICT displays **159 people inside Tibet and China since 2009**, plus **11 in exile**; its update label is July 3, 2026. The exile section includes Thubten Ngodrup, Delhi, April 27, 1998, and Lobga Rangzen, New York, July 2, 2026. Consequently, the two sections do not share a starting year. [ICT fact sheet](https://savetibet.org/tibetan-self-immolations/)
- CTA displays **157 people**, with **136 reported deaths**. Its update label is March 14, 2022, but the table includes Taphun on March 27, 2022. The update label is therefore inconsistent with its contents. [CTA fact sheet](https://tibet.net/important-issues/factsheet-immolation-2011-2012/)
- CTA's Choephel entry gives an incident date of November 7, 2011, and a death date of October 11, 2011. This chronological inconsistency requires case-level verification. [CTA fact sheet](https://tibet.net/important-issues/factsheet-immolation-2011-2012/)
- RFA reports the March 30, 2022 Tsering Samdup case; the reviewed ICT and CTA 2022 sections list only Tsewang Norbu and Taphun. Treat this as a reconciliation candidate, not an automatic addition to either headline total. [RFA report](https://www.rfa.org/english/news/tibet/yushul-immolation-03312022125553.html)
- ICT flags uncertainty around the April 6, 2012 deaths of Thubten Nyandak Rinpoche and Atse. Preserve that uncertainty in any inclusion decision. [ICT fact sheet](https://savetibet.org/tibetan-self-immolations/)

The accompanying [source-reported counts](../data/source-reported-counts.json) preserve published claims separately. They are not a reconciled project total. CTA's listed annual values sum to 157; that arithmetic check does not independently verify the incidents.

## Rules for the eventual visual record

1. Use one person per record, with a separate event identifier for incidents involving multiple people. Label charts as people or events explicitly.
2. Separate incidents inside the PRC from those in exile. Include pre-2009 exile history if the project covers all past cases.
3. Preserve original name spellings and aliases. Match on date and location as well as name; identical names alone do not establish identity.
4. Store incident date, report publication date, death date, and date of last outcome information separately. Keep approximate dates approximate.
5. Preserve unknown, reported deceased, believed deceased, and survived-as-of-a-given-date as distinct claims. Missing death information does not establish survival.
6. Keep Tibetan place names and Chinese administrative aliases. Separate birthplace from incident location. Record geographic precision; never present a county centroid as an exact incident site.
7. Give each factual claim a source URL and retrieval date. Multiple outlets repeating one witness account are not necessarily independent corroboration.
8. Keep conflicting claims and review decisions visible. Compute final totals from reviewed records with explicit inclusion rules.
9. Begin with factual metadata. Images and biographical prose require separate provenance and reuse checks.

Suggested fields: `person_id`, `event_id`, `name`, `aliases`, `incident_date`, `date_precision`, `age`, `age_precision`, `incident_location`, `location_aliases`, `administrative_region`, `country`, `geographic_scope`, `latitude`, `longitude`, `location_precision`, `outcome`, `outcome_as_of`, `inclusion_status`, `source_claims`, `review_notes`.

## Access and verification

The web research tool exposed the fact sheets and the RFA article for review. A direct download of the ICT page returned HTTP 403, so no complete local snapshot or bulk extraction is claimed. Only source discovery, selected record checks, and transcription of published aggregate counts are complete.
