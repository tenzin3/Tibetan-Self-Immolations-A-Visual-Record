#!/usr/bin/env python3
"""Download the International Campaign for Tibet (ICT) self-immolation fact sheet
and save its structured fields to data/ict-records.json.

Kept per person: name (and other names), date, protest location, age, reported
whereabouts/wellbeing, monastery/occupation, photo URL, every link in the entry,
and a link back to the entry. ICT's narrative text is not copied.

Missing values are stored as "Unknown". The previous snapshot is kept if the
page cannot be downloaded or no longer looks like the fact sheet.

Usage:
  python3 scripts/fetch_ict.py                 # download and update the snapshot
  python3 scripts/fetch_ict.py --html page.html  # parse a saved copy instead
Standard library only.
"""
import argparse
import html
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

URL = "https://savetibet.org/tibetan-self-immolations/"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "ict-records.json"
UNKNOWN = "Unknown"

MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]
FIELDS = {
    "date": r"Date",
    "location": r"Protest location|Location",
    "age": r"Age",
    "status": r"Current whereabouts/wellbeing|Current whereabouts|Whereabouts",
    "monastery": r"Monastery",
    "occupation": r"Occupation",
}


class FactSheetParser(HTMLParser):
    """Walks the page: <h1> headings mark year / exile sections; each accordion
    panel holds one entry (heading span + panel body)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.section = ""
        self.entries = []
        self._h1 = None
        self._name = None
        self._body_depth = 0
        self._body = None
        self._link = None
        self._last_anchor = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if tag == "h1":
            self._h1 = []
        elif tag == "span" and "fusion-toggle-heading" in cls:
            self._name = []
        elif tag == "div" and "panel-collapse" in cls:
            self._last_anchor = a.get("id")
        if self._body is not None:
            if tag == "div":
                self._body_depth += 1
            if tag in ("br", "p", "li", "div", "tr"):
                self._body["text"].append("\n")
            if tag == "a" and a.get("href"):
                self._link = {"url": a["href"], "text": []}
            if tag == "img":
                src = a.get("data-orig-src") or a.get("src") or ""
                if src.startswith("http") and not self._body["photo"]:
                    self._body["photo"] = src
            return
        if tag == "div" and "panel-body" in cls:
            self._body = {"text": [], "links": [], "photo": None}
            self._body_depth = 1

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag == "div" and self._body is not None:
            self._body_depth -= 1

    def handle_endtag(self, tag):
        if tag == "h1" and self._h1 is not None:
            self.section = " ".join("".join(self._h1).split())
            self._h1 = None
        elif tag == "span" and self._name is not None:
            self._pending_name = " ".join("".join(self._name).split())
            self._name = None
        elif self._body is not None:
            if tag == "a" and self._link is not None:
                self._link["text"] = " ".join("".join(self._link["text"]).split())
                self._body["links"].append(self._link)
                self._link = None
            if tag in ("p", "li", "tr"):
                self._body["text"].append("\n")
            if tag == "div":
                self._body_depth -= 1
                if self._body_depth == 0:
                    self.entries.append({
                        "section": self.section,
                        "heading": getattr(self, "_pending_name", ""),
                        "anchor": self._last_anchor,
                        "text": "".join(self._body["text"]),
                        "links": self._body["links"],
                        "photo": self._body["photo"],
                    })
                    self._body = None

    def handle_data(self, data):
        if self._h1 is not None:
            self._h1.append(data)
        if self._name is not None:
            self._name.append(data)
        if self._body is not None:
            self._body["text"].append(data)
            if self._link is not None:
                self._link["text"].append(data)


def parse_date(raw):
    m = re.search(r"(" + "|".join(MONTHS) + r")\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})", raw, re.I)
    if m:
        return f"{int(m.group(3)):04d}-{MONTHS.index(m.group(1).lower()) + 1:02d}-{int(m.group(2)):02d}", "day"
    m = re.search(r"(" + "|".join(MONTHS) + r")\s+(\d{4})", raw, re.I)
    if m:
        return f"{int(m.group(2)):04d}-{MONTHS.index(m.group(1).lower()) + 1:02d}", "month"
    m = re.search(r"\b(19|20)\d{2}\b", raw)
    if m:
        return m.group(0), "year"
    return UNKNOWN, None


def field(text, key):
    pat = re.compile(r"^\s*(?:" + FIELDS[key] + r")\s*:\s*(.*?)\s*$", re.I | re.M)
    m = pat.search(text)
    if not m:
        return UNKNOWN
    v = " ".join(m.group(1).split()).rstrip(">").strip()
    return v or UNKNOWN


def title_name(s):
    return " ".join(w.capitalize() for w in s.split())


def split_heading(heading):
    """'DHONDUP (AKA PASSANG DHONDUP)' -> ('Dhondup', ['Passang Dhondup'], marked)
       'THUBTEN NYANDAK RINPOCHE & ATSE*' -> two people."""
    marked = "*" in heading
    h = heading.replace("*", "").strip()
    aliases = []
    for inner in re.findall(r"\(([^)]*)\)", h):
        aliases.append(re.sub(r"^\s*(aka|a\.k\.a\.)\s+", "", inner, flags=re.I).strip())
    h = re.sub(r"\([^)]*\)", "", h).strip()
    names = [n.strip() for n in re.split(r"\s+&\s+|\s+AND\s+", h) if n.strip()]
    return [title_name(n) for n in names], [title_name(a) for a in aliases if a], marked


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def parse(page_html):
    p = FactSheetParser()
    p.feed(page_html)
    p.close()
    m = re.search(r"Last Updated:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})", page_html)
    page_updated = parse_date(m.group(1))[0] if m else UNKNOWN
    head = re.search(r"details of the (\d+) Tibetans who have self-immolated inside Tibet and China[^.]*?as well as (\d+) others", html.unescape(re.sub(r"<[^>]+>", " ", page_html)))
    records = []
    for e in p.entries:
        text = e["text"].replace(" ", " ")
        if not re.search(r"^\s*Date\s*:", text, re.I | re.M):
            continue  # not a person entry (e.g. another accordion on the page)
        names, aliases, marked = split_heading(e["heading"])
        date_raw = field(text, "date")
        date, precision = parse_date(date_raw)
        exile = "exile" in e["section"].lower()
        links, seen = [], set()
        for ln in e["links"]:
            u = html.unescape(ln["url"]).strip()
            if u.startswith("http") and u not in seen:
                seen.add(u)
                links.append({"text": ln["text"] or u, "url": u})
        for name in names:
            records.append({
                "ict_id": f"ict-{slug(name)}-{date if date != UNKNOWN else 'undated'}",
                "section": "exile" if exile else "tibet",
                "name": name,
                "heading_as_published": e["heading"],
                "aliases": aliases,
                "joint_entry_with": [n for n in names if n != name],
                "marked_with_asterisk": marked,
                "date": date,
                "date_precision": precision,
                "date_as_published": date_raw,
                "location_as_published": field(text, "location"),
                "age_as_published": field(text, "age"),
                "status_as_published": field(text, "status"),
                "monastery_as_published": field(text, "monastery"),
                "occupation_as_published": field(text, "occupation"),
                "photo_url": e["photo"] or UNKNOWN,
                "links": links,
                "source_url": URL + (f"#{e['anchor']}" if e["anchor"] else ""),
            })
    return {
        "source": "International Campaign for Tibet",
        "source_url": URL,
        "retrieved": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "page_last_updated": page_updated,
        "published_counts": {
            "tibet_and_china_since_2009": int(head.group(1)) if head else UNKNOWN,
            "exile": int(head.group(2)) if head else UNKNOWN,
        },
        "parsed_counts": {
            "tibet": sum(r["section"] == "tibet" for r in records),
            "exile": sum(r["section"] == "exile" for r in records),
        },
        "note": "Structured fields only; ICT's narrative text is not copied. Missing values are 'Unknown'.",
        "records": records,
    }


def download():
    req = urllib.request.Request(URL, headers={
        "User-Agent": "Mozilla/5.0 (compatible; tibetan-self-immolations-visual-record; +https://github.com/tenzin3/Tibetan-Self-Immolations-A-Visual-Record)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", errors="replace")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", help="parse a saved copy of the page instead of downloading")
    args = ap.parse_args()
    try:
        page = Path(args.html).read_text(encoding="utf-8") if args.html else download()
    except Exception as exc:  # network problem: keep the last good snapshot
        print(f"::warning::Could not download the ICT fact sheet ({exc}). Keeping the previous snapshot.")
        return 3  # the workflow then retries with a headless browser
    data = parse(page)
    n_tibet, n_exile = data["parsed_counts"]["tibet"], data["parsed_counts"]["exile"]
    previous = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else None
    prev_total = len(previous["records"]) if previous else 0
    if n_tibet < 100 or n_exile < 1 or (prev_total and n_tibet + n_exile < prev_total * 0.9):
        print(f"::error::ICT page parsed to {n_tibet} + {n_exile} entries (previously {prev_total}). "
              "The page layout may have changed. Keeping the previous snapshot.")
        return 1
    if previous and previous["records"] == data["records"] and previous["page_last_updated"] == data["page_last_updated"]:
        data["retrieved"] = previous["retrieved"]  # nothing changed: avoid a commit just for the date
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"ICT: {n_tibet} inside Tibet and China, {n_exile} in exile "
          f"(ICT publishes {data['published_counts']['tibet_and_china_since_2009']} and {data['published_counts']['exile']}). "
          f"Page last updated {data['page_last_updated']}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
