#!/usr/bin/env python3
"""Build the dataset used by the visualization by merging two sources.

Reads
  data/cta-records.json            CTA fact sheet, transcribed (157 people inside Tibet and China)
  research/date-corrections.json   reviewed corrections to CTA values, with evidence
  data/ict-records.json            ICT fact sheet snapshot (scripts/fetch_ict.py, refreshed weekly)
  research/match-overrides.json    optional manual decisions for CTA <-> ICT matching
  site/portraits/portraits.json    optional verified portraits

Writes
  site/data/records.json / records.js   the merged dataset used by the page
  data/merge-report.json                 how every ICT entry was matched, for review
  README.md                              refreshes the figures between the "figures" markers

Rules
  * One record per person. CTA values (after reviewed corrections) stay primary;
    ICT values are kept alongside and fill fields the CTA leaves empty.
  * People listed only by ICT (inside Tibet or in exile) are added from ICT.
  * Every field records which source it came from ("field_sources").
  * Missing values are stored as "Unknown"; nothing is guessed.
  * Disagreements between the sources are listed in the person's notes.
Standard library only.
"""
import difflib
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CTA = ROOT / "data" / "cta-records.json"
CORR = ROOT / "research" / "date-corrections.json"
ICT = ROOT / "data" / "ict-records.json"
OVERRIDES = ROOT / "research" / "match-overrides.json"
PORTRAITS = ROOT / "site" / "portraits" / "portraits.json"
OUT_DIR = ROOT / "site" / "data"
REPORT = ROOT / "data" / "merge-report.json"
README = ROOT / "README.md"
UNKNOWN = "Unknown"

CTA_URL_DEFAULT = "https://tibet.net/important-issues/factsheet-immolation-2011-2012/"
MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], 1)}
TIBET_COUNTRY = "Tibet and China"


# ---------------------------------------------------------------- helpers
def known(v):
    return v is not None and v != "" and v != UNKNOWN


def or_unknown(v):
    return v if known(v) else UNKNOWN


def parse_status_date(text):
    """(iso, precision) from CTA status text: 'Died on 6/4/2012', 'Died 13/3/2013',
    'Died on 21/02/12', 'Died on 30 July 2012', 'Died in October 2018'."""
    if not text:
        return None, None
    t = text.replace(" ", "")
    m = re.search(r"(\d{1,2})/+(\d{1,2})/+(\d{2,4})", t)
    if m:
        d, mo, y = (int(g) for g in m.groups())
        if y < 100:
            y += 2000
        try:
            return date(y, mo, d).isoformat(), "day"
        except ValueError:
            return None, None
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text)
    if m and m.group(2).lower() in MONTHS:
        return date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1))).isoformat(), "day"
    m = re.search(r"in\s+([A-Za-z]+)\s+(\d{4})", text)
    if m and m.group(1).lower() in MONTHS:
        return f"{m.group(2)}-{MONTHS[m.group(1).lower()]:02d}", "month"
    return None, None


OUTCOME_LABEL = {
    "died": "Died",
    "believed_died": "Believed to have died",
    "survived": "Survived (released or recovering)",
    "custody": "Taken into Chinese custody",
    "injured": "Injured; later status not reported",
    "unknown": "Outcome unknown",
}


def outcome_cta(status):
    s = (status or "").lower()
    if s.startswith("died"):
        return "died"
    if "released" in s or "recovering" in s:
        return "survived"
    if "custody" in s:
        return "custody"
    if "hospital" in s or "injured" in s:
        return "injured"
    return "unknown"


def outcome_ict(status):
    s = (status or "").lower()
    if not known(status) or s.startswith("unclear"):
        return "unknown"
    if "survived" in s and "unlikely" not in s or "released" in s:
        return "survived"
    if any(w in s for w in ("believed", "presumed", "unlikely to have survi")) and ("deceased" in s or "died" in s or "survi" in s):
        return "believed_died"
    if "deceased" in s or "died" in s or "dead" in s:
        return "died"
    if "hospital" in s or "condition" in s or "injur" in s:
        return "injured"
    if "custody" in s or "detain" in s or "arrest" in s:
        return "custody"
    return "unknown"


def region_of(loc):
    l = (loc or "").lower()
    for key, name in [("sichuan", "Sichuan"), ("qinghai", "Qinghai"), ("gansu", "Gansu"),
                      ("tibet autonomous region", "Tibet Autonomous Region"), ("(tar)", "Tibet Autonomous Region"),
                      ("lhasa", "Tibet Autonomous Region"), ("beijing", "Beijing")]:
        if key in l:
            return name
    for key, name in [("ngaba", "Sichuan"), ("meruma", "Sichuan"), ("dzogchen", "Sichuan"), ("kardze", "Sichuan"),
                      ("rebgong", "Qinghai"), ("golog", "Qinghai"), ("golok", "Qinghai"), ("yushu", "Qinghai"),
                      ("kanlho", "Gansu"), ("gannan", "Gansu"), ("labrang", "Gansu"), ("machu", "Gansu")]:
        if key in l:
            return name
    return UNKNOWN


EXILE_COUNTRIES = [("india", "India"), ("delhi", "India"), ("dharamsala", "India"), ("nepal", "Nepal"),
                   ("kathmandu", "Nepal"), ("usa", "United States"), ("united states", "United States"),
                   ("new york", "United States")]


def exile_country(loc):
    l = (loc or "").lower()
    for key, name in EXILE_COUNTRIES:
        if key in l:
            return name
    return UNKNOWN


def age_group(age):
    """Bucket a published age ('24', 'Late twenties', 'Believed to be 25', 'Forties or fifties')."""
    if isinstance(age, int):
        n = age
    else:
        s = str(age or "").lower()
        m = re.search(r"\d+", s)
        if m:
            n = int(m.group())
        else:
            words = {"teen": 15, "twent": 20, "thirt": 30, "fort": 40, "fift": 50, "sixt": 60, "sevent": 70, "eight": 80}
            n = next((v for k, v in words.items() if k in s), None)
            if n is None:
                return "na"
    return "u20" if n < 20 else "20s" if n < 30 else "30s" if n < 40 else "40s" if n < 50 else "50+"


def initials(name):
    parts = [p for p in re.split(r"[\s\-]+", name) if p and p[0].isalpha()]
    if not parts:
        return "?"
    return (parts[0][0] + (parts[-1][0] if len(parts) > 1 else "")).upper()


def norm_name(s):
    s = s.lower()
    s = re.sub(r"\b(rinpoche|tulku|ven|venerable|aka)\b", " ", s)
    s = re.sub(r"[^a-z]", "", s)
    for a, b in [("ph", "p"), ("kh", "k"), ("th", "t"), ("dh", "d"), ("ee", "e"), ("oe", "o"), ("ue", "u"),
                 ("ey", "e"), ("ay", "e"), ("y", "i"), ("w", "o"), ("z", "s"), ("ck", "k")]:
        s = s.replace(a, b)
    return re.sub(r"(.)\1+", r"\1", s)


def name_sim(names_a, names_b):
    best = 0.0
    for a in names_a:
        for b in names_b:
            na, nb = norm_name(a), norm_name(b)
            if not na or not nb:
                continue
            r = difflib.SequenceMatcher(None, na, nb).ratio()
            if na in nb or nb in na:
                r = max(r, 0.8)
            best = max(best, r)
    return best


def day_gap(a, b):
    try:
        return abs((date.fromisoformat(a) - date.fromisoformat(b)).days)
    except (ValueError, TypeError):
        if a and b and a[:7] == b[:7]:
            return 15  # month-only date in the same month
        return 9999


def host(url):
    return url.split("/")[2].replace("www.", "") if url.count("/") >= 2 else url


def add_source(sources, title, publisher, url):
    if url and url not in [s["url"] for s in sources]:
        sources.append({"title": title, "publisher": publisher, "url": url})


# ---------------------------------------------------------------- CTA
def build_cta(cta, corr, portraits):
    cta_url = cta.get("source_url", CTA_URL_DEFAULT)
    by_pos, checks = {}, {}
    for c in corr["corrections"]:
        by_pos.setdefault(c["cta_table_position"], []).append(c)
    for c in corr.get("additional_checks", []):
        checks.setdefault(c["cta_table_position"], []).append(c)

    people = []
    for r in cta["records"]:
        pos = r["source_table_position"]
        pid = f"cta-{pos:03d}"
        cta_src = {"label": "CTA", "url": cta_url}
        fs = {k: cta_src for k in ("name", "date", "age", "gender", "location", "affiliation", "parents", "outcome")}
        incident_date, location, affiliation = r["incident_date"], r["incident_location"], r["affiliation"]
        death_date, death_precision = parse_status_date(r["status"])
        applied = []
        for c in by_pos.get(pos, []):
            f, v = c["field"], c["suggested_value"]
            corrected = {"label": f"Corrected ({c['certainty']} certainty)", "url": c["supporting_report_url"]}
            if f == "incident_date":
                incident_date = v; fs["date"] = corrected
            elif f == "death_date":
                death_date, death_precision = v, "day"; fs["death_date"] = corrected
            elif f == "incident_location":
                location = v; fs["location"] = corrected
            elif f == "affiliation":
                affiliation = v; fs["affiliation"] = corrected
            applied.append({"field": f.replace("_", " "), "original": c["original_value"], "used": v,
                            "certainty": c["certainty"], "evidence": c["evidence"], "url": c["supporting_report_url"]})
        outcome = outcome_cta(r["status"])
        if outcome != "died":
            death_date = None
        sources = [{"title": "CTA fact sheet: self-immolations in Tibet", "publisher": "Central Tibetan Administration", "url": cta_url}]
        for a in applied:
            add_source(sources, "Supporting report for a reviewed correction", host(a["url"]), a["url"])
        for c in checks.get(pos, []):
            add_source(sources, "Date check", host(c["source_url"]), c["source_url"])
        age = r["age"] if r["age"] is not None else r["age_raw"]
        people.append({
            "id": pid, "position": pos, "section": "tibet", "country": TIBET_COUNTRY,
            "name": r["name"], "aliases": list(r["aliases"]),
            "gender": or_unknown(r["gender"]),
            "age": or_unknown(age), "age_is_approximate": r["age"] is None and known(r["age_raw"]),
            "affiliation": or_unknown(affiliation), "location": or_unknown(location),
            "father": or_unknown(r["father"]), "mother": or_unknown(r["mother"]),
            "date": incident_date, "date_as_published": r["incident_date_raw"],
            "outcome": outcome, "status_as_published": r["status_raw"],
            "death_date": death_date, "death_date_precision": death_precision,
            "corrections": applied, "checks": [c["result"] for c in checks.get(pos, [])],
            "notes": [n for n in r["verification_issues"] if not (applied and "Incident date in source is later" in n)],
            "sources": sources, "field_sources": fs, "listed_by": ["CTA"], "ict": None,
            "portrait": portraits.get(pid),
        })
    return people


# ---------------------------------------------------------------- ICT
def ict_summary(i):
    return {k: i[k] for k in ("name", "aliases", "date", "date_as_published", "location_as_published", "age_as_published",
                               "status_as_published", "monastery_as_published", "occupation_as_published",
                               "photo_url", "links", "source_url", "marked_with_asterisk")}


def match_ict(people, ict_records, overrides):
    """Pair ICT entries (inside Tibet) with CTA people: same date (±3 days) and similar names.
    Returns {ict_id: person_id} and the review report."""
    force = {o["ict_id"]: o["person_id"] for o in overrides.get("same_person", [])}
    never = {(o["ict_id"], o["person_id"]) for o in overrides.get("different_people", [])}
    cands = []
    for i in ict_records:
        if i["section"] != "tibet" or i["ict_id"] in force:
            continue
        for p in people:
            if (i["ict_id"], p["id"]) in never:
                continue
            gap = day_gap(i["date"], p["date"])
            sim = name_sim([i["name"]] + i["aliases"], [p["name"]] + p["aliases"])
            if (gap <= 3 and sim >= 0.45) or (gap <= 45 and sim >= 0.9):
                cands.append((sim - gap * 0.04, sim, gap, i["ict_id"], p["id"]))
    cands.sort(reverse=True)
    pairs, used_p = dict(force), set(force.values())
    report = {i: {"ict_id": i, "person_id": p, "how": "manual override"} for i, p in force.items()}
    for score, sim, gap, iid, pid in cands:
        if iid in pairs or pid in used_p:
            continue
        pairs[iid] = pid
        used_p.add(pid)
        report[iid] = {"ict_id": iid, "person_id": pid, "how": "automatic", "name_similarity": round(sim, 2), "days_apart": gap}
    # Second pass: spellings can differ completely (e.g. Dopo / Dorbe). Pair the entries left over
    # when each source has exactly one unmatched person on the same date in the same province.
    left_i = [i for i in ict_records if i["section"] == "tibet" and i["ict_id"] not in pairs and i["date_precision"] == "day"]
    left_p = [p for p in people if p["id"] not in used_p]
    for d in sorted({i["date"] for i in left_i}):
        is_ = [i for i in left_i if i["date"] == d]
        ps = [p for p in left_p if p["date"] == d]
        if len(is_) == 1 and len(ps) == 1:
            i, p = is_[0], ps[0]
            ri, rp = region_of(i["location_as_published"]), region_of(p["location"])
            if (i["ict_id"], p["id"]) not in never and (ri == rp or UNKNOWN in (ri, rp)):
                pairs[i["ict_id"]] = p["id"]
                used_p.add(p["id"])
                report[i["ict_id"]] = {"ict_id": i["ict_id"], "person_id": p["id"], "how": "same date and province; names differ",
                                       "name_similarity": round(name_sim([i["name"]] + i["aliases"], [p["name"]] + p["aliases"]), 2),
                                       "days_apart": 0, "review": True}
    return pairs, report


def merge_ict_into(p, i):
    """Attach an ICT entry to a CTA person: keep CTA values, fill unknowns, note disagreements."""
    ict_src = {"label": "ICT", "url": i["source_url"]}
    p["ict"] = ict_summary(i)
    p["listed_by"].append("ICT")
    add_source(p["sources"], "ICT fact sheet entry", "International Campaign for Tibet", i["source_url"])
    for ln in i["links"]:
        add_source(p["sources"], ln["text"], host(ln["url"]), ln["url"])
    names_agree = name_sim([i["name"]] + i["aliases"], [p["name"]] + p["aliases"]) >= 0.45
    for a in [i["name"]] + i["aliases"]:
        if norm_name(a) != norm_name(p["name"]) and a not in p["aliases"]:
            p["aliases"].append(a)
    if not names_agree:
        p["notes"].append(f"Name differs between sources: the CTA gives {p['name']}, ICT gives {i['name']}. "
                          "They are treated as one person because each source lists exactly one person on this date in the same province.")
    # fill fields the CTA leaves empty
    if not known(p["age"]) and known(i["age_as_published"]):
        p["age"] = i["age_as_published"]; p["age_is_approximate"] = not i["age_as_published"].isdigit()
        p["field_sources"]["age"] = ict_src
    if not known(p["location"]) and known(i["location_as_published"]):
        p["location"] = i["location_as_published"]; p["field_sources"]["location"] = ict_src
    if not known(p["affiliation"]):
        aff = i["monastery_as_published"] if known(i["monastery_as_published"]) else i["occupation_as_published"]
        if known(aff):
            p["affiliation"] = aff; p["field_sources"]["affiliation"] = ict_src
    if p["outcome"] == "unknown" and outcome_ict(i["status_as_published"]) != "unknown":
        p["outcome"] = outcome_ict(i["status_as_published"]); p["field_sources"]["outcome"] = ict_src
    # disagreements, kept visible
    if i["date"] != UNKNOWN and i["date"] != p["date"]:
        p["notes"].append(f"Date differs between sources: ICT gives {i['date_as_published']}; this record uses {p['date']}.")
    ia = i["age_as_published"]
    if ia.isdigit() and isinstance(p["age"], int) and int(ia) != p["age"]:
        p["notes"].append(f"Age differs between sources: ICT gives {ia}; the CTA gives {p['age']}.")
    io = outcome_ict(i["status_as_published"])
    if io != "unknown" and io != p["outcome"] and not (io == "believed_died" and p["outcome"] == "died"):
        p["notes"].append(f"Outcome differs between sources: ICT reports “{i['status_as_published']}”; the CTA reports “{p['status_as_published']}”.")
    if i["marked_with_asterisk"]:
        p["notes"].append("ICT marks this entry with an asterisk and adds a note about its details; see the ICT entry.")


def person_from_ict(i, portraits):
    """A person listed only by ICT. Missing values stay 'Unknown'."""
    src = {"label": "ICT", "url": i["source_url"]}
    exile = i["section"] == "exile"
    age = i["age_as_published"]
    age_val = int(age) if age.isdigit() else age
    aff = i["monastery_as_published"] if known(i["monastery_as_published"]) else i["occupation_as_published"]
    outcome = outcome_ict(i["status_as_published"])
    sources = [{"title": "ICT fact sheet entry", "publisher": "International Campaign for Tibet", "url": i["source_url"]}]
    for ln in i["links"]:
        add_source(sources, ln["text"], host(ln["url"]), ln["url"])
    notes = ["Protest in exile; listed in ICT's separate section on self-immolations outside Tibet." if exile
             else "Listed by ICT; not in the CTA table."]
    if i["date_precision"] != "day":
        notes.append(f"ICT gives only an approximate date: “{i['date_as_published']}”.")
    if i["joint_entry_with"]:
        notes.append(f"ICT lists this person together with {', '.join(i['joint_entry_with'])}.")
    if i["marked_with_asterisk"]:
        notes.append("ICT marks this entry with an asterisk and adds a note about its details; see the ICT entry.")
    pid = i["ict_id"]
    return {
        "id": pid, "position": None, "section": i["section"],
        "country": exile_country(i["location_as_published"]) if exile else TIBET_COUNTRY,
        "name": i["name"], "aliases": list(i["aliases"]),
        "gender": UNKNOWN, "age": age_val, "age_is_approximate": known(age) and not age.isdigit(),
        "affiliation": or_unknown(aff), "location": or_unknown(i["location_as_published"]),
        "father": UNKNOWN, "mother": UNKNOWN,
        "date": i["date"] if i["date_precision"] == "day" else (i["date"] + "-15" if i["date_precision"] == "month" else i["date"] + "-07-01"),
        "date_precision": i["date_precision"], "date_as_published": i["date_as_published"],
        "outcome": outcome, "status_as_published": i["status_as_published"],
        "death_date": None, "death_date_precision": None,
        "corrections": [], "checks": [], "notes": notes, "sources": sources,
        "field_sources": {k: src for k in ("name", "date", "age", "gender", "location", "affiliation", "parents", "outcome")},
        "listed_by": ["ICT"], "ict": ict_summary(i),
        "portrait": portraits.get(pid),
    }


# ---------------------------------------------------------------- README figures
def figures_markdown(meta, people):
    tib = [p for p in people if p["section"] == "tibet"]
    exi = [p for p in people if p["section"] == "exile"]
    by_year = {}
    for p in tib:
        by_year[p["date"][:4]] = by_year.get(p["date"][:4], 0) + 1
    regions = {}
    for p in tib:
        regions[p["region"]] = regions.get(p["region"], 0) + 1
    countries = {}
    for p in exi:
        countries[p["country"]] = countries.get(p["country"], 0) + 1
    lines = [
        f"*Updated automatically from the sources. CTA table transcribed {meta['sources']['cta']['retrieved']}; "
        f"ICT fact sheet last checked {meta['sources']['ict']['retrieved']} (ICT's page last updated {meta['sources']['ict']['page_last_updated']}).*",
        "",
        "| | |", "| --- | --- |",
        f"| People in this record | **{meta['people']}** |",
        f"| Inside Tibet and China | **{meta['tibet']}** (CTA lists {meta['listed_by_cta']}; ICT lists {meta['sources']['ict']['parsed_tibet']}; {meta['matched']} appear in both) |",
        f"| In exile | **{meta['exile']}** ({', '.join(f'{c} {n}' for c, n in sorted(countries.items(), key=lambda x: -x[1]))}) |",
        f"| Reported to have died | **{meta['died']}**, plus **{meta['believed_died']}** believed to have died |",
        f"| Survived | **{meta['survived']}** |",
        f"| In custody, injured with no later report, or outcome unknown | **{meta['other']}** |",
        f"| Men / women / gender not stated | **{meta['male']} / {meta['female']} / {meta['gender_unknown']}** |",
        f"| First and most recent | **{meta['first']}** · **{meta['last']}** |",
        "",
        "**Inside Tibet and China, by year:** " + " · ".join(f"{y}: {n}" for y, n in sorted(by_year.items())),
        "",
        "**By province:** " + " · ".join(f"{r}: {n}" for r, n in sorted(regions.items(), key=lambda x: -x[1])),
    ]
    return "\n".join(lines)


def update_readme(md):
    if not README.exists():
        return
    s = README.read_text(encoding="utf-8")
    a, b = "<!-- figures:start -->", "<!-- figures:end -->"
    if a in s and b in s:
        s = s[: s.index(a) + len(a)] + "\n" + md + "\n" + s[s.index(b):]
        README.write_text(s, encoding="utf-8")


# ---------------------------------------------------------------- main
def main():
    cta = json.loads(CTA.read_text(encoding="utf-8"))
    corr = json.loads(CORR.read_text(encoding="utf-8"))
    ict = json.loads(ICT.read_text(encoding="utf-8")) if ICT.exists() else None
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    portraits = json.loads(PORTRAITS.read_text(encoding="utf-8")).get("portraits", {}) if PORTRAITS.exists() else {}

    people = build_cta(cta, corr, portraits)
    by_id = {p["id"]: p for p in people}
    report = {"matched": [], "ict_only_tibet": [], "exile": [], "cta_only": []}
    if ict:
        pairs, how = match_ict(people, ict["records"], overrides)
        for i in ict["records"]:
            if i["ict_id"] in pairs and pairs[i["ict_id"]] in by_id:
                p = by_id[pairs[i["ict_id"]]]
                merge_ict_into(p, i)
                report["matched"].append({**how[i["ict_id"]], "cta_name": p["name"], "ict_name": i["name"], "cta_date": p["date"], "ict_date": i["date"]})
            else:
                q = person_from_ict(i, portraits)
                people.append(q)
                key = "exile" if i["section"] == "exile" else "ict_only_tibet"
                report[key].append({"id": q["id"], "name": q["name"], "date": i["date_as_published"], "location": i["location_as_published"]})
        report["cta_only"] = [{"id": p["id"], "name": p["name"], "date": p["date"]} for p in people if p["listed_by"] == ["CTA"]]

    for p in people:
        p["initials"] = initials(p["name"])
        p["region"] = region_of(p["location"]) if p["section"] == "tibet" else f"{p['country']} (exile)"
        p["age_group"] = age_group(p["age"])
        p["outcome_label"] = OUTCOME_LABEL[p["outcome"]]
        p.setdefault("date_precision", "day")
        p["days_until_death"] = None
        if p["death_date"] and p["death_date_precision"] == "day":
            p["days_until_death"] = (date.fromisoformat(p["death_date"]) - date.fromisoformat(p["date"])).days

    # chronological order; people sharing a date and place form one incident
    people.sort(key=lambda p: (p["date"], p["position"] or 999, p["name"]))
    groups = {}
    for p in people:
        groups.setdefault((p["date"], re.sub(r"[^a-z]", "", p["location"].lower())[:40]), []).append(p["id"])
    for n, (key, ids) in enumerate(sorted(groups.items()), 1):
        for pid in ids:
            q = next(x for x in people if x["id"] == pid)
            q["event_id"] = f"event-{n:03d}"
            q["shared_with"] = [x for x in ids if x != pid]

    tib = [p for p in people if p["section"] == "tibet"]
    meta = {
        "title": "Tibetan Self-Immolations: A Visual Record",
        "people": len(people), "tibet": len(tib), "exile": len(people) - len(tib),
        "listed_by_cta": sum("CTA" in p["listed_by"] for p in people),
        "matched": sum(p["listed_by"] == ["CTA", "ICT"] for p in people),
        "ict_only": sum(p["listed_by"] == ["ICT"] for p in people),
        "events": len(groups),
        "died": sum(p["outcome"] == "died" for p in people),
        "believed_died": sum(p["outcome"] == "believed_died" for p in people),
        "survived": sum(p["outcome"] == "survived" for p in people),
        "other": sum(p["outcome"] in ("custody", "injured", "unknown") for p in people),
        "female": sum(p["gender"] == "Female" for p in people),
        "male": sum(p["gender"] == "Male" for p in people),
        "gender_unknown": sum(p["gender"] == UNKNOWN for p in people),
        "first_year": int(people[0]["date"][:4]), "last_year": int(people[-1]["date"][:4]),
        "first": f"{people[0]['name']}, {people[0]['date']}", "last": f"{people[-1]['name']}, {people[-1]['date']}",
        "corrections_applied": sum(len(p["corrections"]) for p in people),
        "with_portrait": sum(bool(p["portrait"]) for p in people),
        "sources": {
            "cta": {"name": "Central Tibetan Administration", "url": cta.get("source_url", CTA_URL_DEFAULT),
                    "retrieved": cta.get("retrieved_date", UNKNOWN), "page_last_updated": cta.get("source_last_updated_raw", UNKNOWN),
                    "records": len(cta["records"])},
            "ict": {"name": "International Campaign for Tibet", "url": ict["source_url"] if ict else "https://savetibet.org/tibetan-self-immolations/",
                    "retrieved": ict["retrieved"] if ict else UNKNOWN, "page_last_updated": ict["page_last_updated"] if ict else UNKNOWN,
                    "published_tibet": ict["published_counts"]["tibet_and_china_since_2009"] if ict else UNKNOWN,
                    "published_exile": ict["published_counts"]["exile"] if ict else UNKNOWN,
                    "parsed_tibet": ict["parsed_counts"]["tibet"] if ict else UNKNOWN,
                    "parsed_exile": ict["parsed_counts"]["exile"] if ict else UNKNOWN},
        },
    }
    meta["built_from"] = f"CTA {meta['sources']['cta']['retrieved']} + ICT {meta['sources']['ict']['retrieved']}"
    data = {"meta": meta, "people": people}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "records.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (OUT_DIR / "records.js").write_text(
        "/* Generated by scripts/build_records.py. Do not edit by hand. */\n"
        "window.VISUAL_RECORD = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
    report["summary"] = {k: meta[k] for k in ("people", "tibet", "exile", "listed_by_cta", "matched", "ict_only")}
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if ict:  # without the ICT snapshot the figures would be incomplete; leave README as it is
        update_readme(figures_markdown(meta, people))
    print(json.dumps(report["summary"]))
    print("ICT-only inside Tibet:", ", ".join(f"{x['name']} ({x['date']})" for x in report["ict_only_tibet"]) or "none")
    print("CTA-only:", ", ".join(f"{x['name']} ({x['date']})" for x in report["cta_only"]) or "none")


if __name__ == "__main__":
    main()
