#!/usr/bin/env python3
"""Build the dataset used by the visualization.

Reads
  data/cta-records.json            157 records transcribed from the CTA fact sheet
  research/date-corrections.json   reviewed corrections + additional checks
  site/portraits/portraits.json    optional portrait registry (may be empty)

Writes
  site/data/records.json           merged dataset (for download / reuse)
  site/data/records.js             same data as `window.VISUAL_RECORD = {...}`
                                   so the page also works when opened from disk

The CTA values are never overwritten silently: every applied correction keeps
the original value, the evidence, the certainty and the supporting URL.

Usage:  python3 scripts/build_records.py      (run from the project root)
"""
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CTA = ROOT / "data" / "cta-records.json"
CORR = ROOT / "research" / "date-corrections.json"
PORTRAITS = ROOT / "site" / "portraits" / "portraits.json"
OUT_DIR = ROOT / "site" / "data"

MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], 1)}


def parse_status_date(text):
    """Return (iso_date or None, precision) from strings like
    'Died on 6/4/2012', 'Died 13/3/2013', 'Died on 21/02/12',
    'Died on 30 July 2012', 'Died in October 2018'."""
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


def outcome_of(status):
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


OUTCOME_LABEL = {
    "died": "Died",
    "survived": "Survived (released or recovering)",
    "custody": "Taken into Chinese custody",
    "injured": "Injured; later status not reported",
    "unknown": "Outcome unknown",
}


def region_of(loc):
    l = (loc or "").lower()
    for key, name in [("sichuan", "Sichuan"), ("qinghai", "Qinghai"), ("gansu", "Gansu"),
                      ("tibet autonomous region", "Tibet Autonomous Region"), ("(tar)", "Tibet Autonomous Region"),
                      ("lhasa", "Tibet Autonomous Region"), ("beijing", "Beijing")]:
        if key in l:
            return name
    # Places the source names without a province
    for key, name in [("ngaba", "Sichuan"), ("meruma", "Sichuan"), ("dzogchen", "Sichuan"),
                      ("rebgong", "Qinghai")]:
        if key in l:
            return name
    return "Not stated"


def initials(name):
    parts = [p for p in re.split(r"[\s\-]+", name) if p and p[0].isalpha()]
    if not parts:
        return "?"
    return (parts[0][0] + (parts[-1][0] if len(parts) > 1 else "")).upper()


def main():
    cta = json.loads(CTA.read_text(encoding="utf-8"))
    corr = json.loads(CORR.read_text(encoding="utf-8"))
    portraits = {}
    if PORTRAITS.exists():
        portraits = json.loads(PORTRAITS.read_text(encoding="utf-8")).get("portraits", {})

    by_pos = {}
    for c in corr["corrections"]:
        by_pos.setdefault(c["cta_table_position"], []).append(c)
    checks = {}
    for c in corr.get("additional_checks", []):
        checks.setdefault(c["cta_table_position"], []).append(c)

    people = []
    for r in cta["records"]:
        pos = r["source_table_position"]
        pid = f"cta-{pos:03d}"
        incident_date = r["incident_date"]
        location = r["incident_location"]
        affiliation = r["affiliation"]
        death_date, death_precision = parse_status_date(r["status"])
        applied = []
        for c in by_pos.get(pos, []):
            f, v = c["field"], c["suggested_value"]
            if f == "incident_date":
                incident_date = v
            elif f == "death_date":
                death_date, death_precision = v, "day"
            elif f == "incident_location":
                location = v
            elif f == "affiliation":
                affiliation = v
            applied.append({
                "field": f.replace("_", " "),
                "original": c["original_value"],
                "used": v,
                "certainty": c["certainty"],
                "evidence": c["evidence"],
                "url": c["supporting_report_url"],
            })
        outcome = outcome_of(r["status"])
        if outcome != "died":
            death_date = None
        days = None
        if death_date and death_precision == "day":
            days = (date.fromisoformat(death_date) - date.fromisoformat(incident_date)).days

        sources = [{"title": "CTA fact sheet: self-immolations in Tibet",
                    "publisher": "Central Tibetan Administration", "url": r["source_url"]}]
        for a in applied:
            if a["url"] not in [s["url"] for s in sources]:
                sources.append({"title": "Supporting report for a reviewed correction",
                                "publisher": a["url"].split("/")[2].replace("www.", ""), "url": a["url"]})
        for c in checks.get(pos, []):
            if c["source_url"] not in [s["url"] for s in sources]:
                sources.append({"title": "Date check", "publisher": c["source_url"].split("/")[2].replace("www.", ""),
                                "url": c["source_url"]})

        portrait = portraits.get(pid)
        people.append({
            "id": pid,
            "position": pos,
            "name": r["name"],
            "initials": initials(r["name"]),
            "aliases": r["aliases"],
            "gender": r["gender"],
            "age": r["age"] if r["age"] is not None else r["age_raw"],
            "age_is_approximate": r["age"] is None and r["age_raw"] is not None,
            "affiliation": affiliation,
            "location": location,
            "region": region_of(location),
            "father": r["father"],
            "mother": r["mother"],
            "date": incident_date,
            "date_as_published": r["incident_date_raw"],
            "outcome": outcome,
            "outcome_label": OUTCOME_LABEL[outcome],
            "status_as_published": r["status_raw"],
            "death_date": death_date,
            "death_date_precision": death_precision,
            "days_until_death": days,
            "corrections": applied,
            "checks": [c["result"] for c in checks.get(pos, [])],
            "notes": [n for n in r["verification_issues"]
                      if not (applied and "Incident date in source is later" in n)],
            "sources": sources,
            "portrait": portrait,
        })

    # Group people who share a date and an incident place -> one event
    people.sort(key=lambda p: (p["date"], p["position"]))
    groups = {}
    for p in people:
        key = (p["date"], re.sub(r"[^a-z]", "", p["location"].lower())[:40])
        groups.setdefault(key, []).append(p["id"])
    for i, (key, ids) in enumerate(sorted(groups.items()), 1):
        for p in people:
            if p["id"] in ids:
                p["event_id"] = f"event-{i:03d}"
                p["shared_with"] = [x for x in ids if x != p["id"]]

    years = [int(p["date"][:4]) for p in people]
    meta = {
        "title": "Tibetan Self-Immolations: A Visual Record",
        "built_on": date.today().isoformat(),
        "source": cta["source"],
        "source_url": cta["source_url"],
        "source_last_updated": cta["source_last_updated_raw"],
        "retrieved": cta["retrieved_date"],
        "scope": cta["scope"],
        "people": len(people),
        "events": len(groups),
        "died": sum(p["outcome"] == "died" for p in people),
        "female": sum(p["gender"] == "Female" for p in people),
        "male": sum(p["gender"] == "Male" for p in people),
        "first_year": min(years),
        "last_year": max(years),
        "corrections_applied": sum(len(p["corrections"]) for p in people),
        "with_portrait": sum(bool(p["portrait"]) for p in people),
    }
    data = {"meta": meta, "people": people}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "records.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT_DIR / "records.js").write_text(
        "/* Generated by scripts/build_records.py. Do not edit by hand. */\n"
        "window.VISUAL_RECORD = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
