"""NASA research data integration.

Data structures were inspected against the live NASA services before
integration (see README.md, section 6):

* OSDR RadLab Data API — https://visualization.osdr.nasa.gov/radlab/api/
  Fields include timestamp, instrument_id, instrument_family, module,
  absorbed_dose_rate (μGy/hour), dose_equivalent_rate (μSv/hour). Formats:
  csv (default), tsv, json, html.
* OSDR Biological Data API — https://visualization.osdr.nasa.gov/biodata/api/v2/
  /datasets/ returns {"OSD-n": {"REST_URL": ...}, ...}
* OSDR Environmental Data App (EDA) — https://visualization.osdr.nasa.gov/eda/
  Interactive app (no documented API). Its tables (ISS cabin temperature,
  humidity, CO₂ and daily radiation dose for Rodent Research missions) can be
  downloaded as CSV and imported here.

Rules followed: never invent NASA values; keep NASA data in separate tables
from astronaut health data; always keep the original source link; if live
access fails, fall back to the bundled snapshot that was retrieved from NASA.
"""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..config import NASA_CACHE_DIR, NASA_LIVE_ENABLED, OSDR_BIODATA_API, RADLAB_API
from ..models import NasaDataset, NasaObservation

RADLAB_SNAPSHOT_QUERY = (RADLAB_API + "?query=(timestamp>=2019-12-05)AND(timestamp<2019-12-25)"
                         "AND((module=Cupola)OR(module=JPM))&fields+=absorbed_dose_rate,instrument_family&format=tsv")
SNAPSHOT_RETRIEVED = "2026-11-04"

RADLAB_UNITS = {"absorbed_dose_rate": "μGy/hour", "dose_equivalent_rate": "μSv/hour", "flux": "cm-2sr-1s-1",
                "latitude": "deg", "longitude": "deg", "altitude": "km", "B": "nT", "L": "unitless"}

CATALOG = [
    {
        "id": "RADLAB-ISS-REM-2019-12",
        "name": "ISS radiation absorbed dose rate — REM (Timepix) monitors, JPM & Cupola",
        "nasa_source": "NASA OSDR RadLab",
        "mission_or_study": "International Space Station (ISS) — REM radiation environment monitors",
        "description": ("Daily absorbed dose rate recorded by two Timepix-based Radiation Environment Monitors "
                        "in the Japanese Experiment Module (JPM) and the Cupola. Historical environmental "
                        "observations — not astronaut medical readings."),
        "variables": [{"name": "absorbed_dose_rate", "unit": "μGy/hour", "description": "Absorbed radiation dose rate"},
                      {"name": "module", "unit": "", "description": "ISS module where the instrument was located"},
                      {"name": "instrument_id", "unit": "", "description": "RadLab instrument identifier"}],
        "date_start": "2019-12-05", "date_end": "2019-12-24",
        "source_url": "https://visualization.osdr.nasa.gov/radlab/",
        "api_url": RADLAB_SNAPSHOT_QUERY,
        "retrieval": "cached-snapshot", "retrieved_at": SNAPSHOT_RETRIEVED,
        "notice": ("Bundled snapshot retrieved from the NASA RadLab Data API on 2026-11-04 so the demo works offline. "
                   "Values are unmodified from NASA's response. Use 'Refresh from NASA' to query the API live."),
        "_cache_file": "radlab_iss_rem_2019-12.tsv",
    },
    {
        "id": "OSDR-EDA-RR",
        "name": "Environmental Data App — Rodent Research mission telemetry & radiation",
        "nasa_source": "NASA OSDR Environmental Data App (EDA)",
        "mission_or_study": "Rodent Research (RR) missions aboard the ISS",
        "description": ("ISS cabin and ground-control temperature, relative humidity and CO₂ telemetry, plus daily "
                        "radiation dose (GCR, South Atlantic Anomaly, total, accumulated). The EDA is an interactive "
                        "app without a documented API: download a mission table as CSV from the EDA and import it "
                        "here (Mission Control → NASA Research → Import CSV/JSON)."),
        "variables": [{"name": "temperature", "unit": "as given in EDA export", "description": "ISS cabin & ground control"},
                      {"name": "relative humidity", "unit": "as given in EDA export", "description": "ISS cabin & ground control"},
                      {"name": "CO2", "unit": "as given in EDA export", "description": "ISS cabin & ground control"},
                      {"name": "radiation dose (GCR / SAA / total)", "unit": "as given in EDA export", "description": "Daily dose"}],
        "date_start": None, "date_end": None,
        "source_url": "https://visualization.osdr.nasa.gov/eda/",
        "api_url": None, "retrieval": "catalog-only", "retrieved_at": None,
        "notice": "No observations stored until a CSV exported from the EDA is imported. Units are taken from the export.",
    },
    {
        "id": "OSDR-STUDY-CATALOG",
        "name": "Open Science Data Repository — study catalogue",
        "nasa_source": "NASA Open Science Data Repository (OSDR)",
        "mission_or_study": "Spaceflight biology & human research studies (OSD-n accessions)",
        "description": ("Catalogue of OSDR studies, including human spaceflight datasets. 'Refresh from NASA' "
                        "queries the Biological Data API listing endpoint and records the number of available studies."),
        "variables": [{"name": "accession", "unit": "", "description": "OSD study accession (e.g. OSD-48)"},
                      {"name": "REST_URL", "unit": "", "description": "Metadata endpoint for each study"}],
        "date_start": None, "date_end": None,
        "source_url": "https://osdr.nasa.gov/",
        "api_url": OSDR_BIODATA_API + "datasets/", "retrieval": "catalog-only", "retrieved_at": None,
        "notice": "Metadata only. Study-level measurements are not converted into astronaut readings.",
    },
    {
        "id": "NLSP",
        "name": "NASA Life Sciences Portal — human spaceflight research",
        "nasa_source": "NASA Life Sciences Portal (NLSP)",
        "mission_or_study": "Human research experiments and data requests",
        "description": "Reference link for human spaceflight research background. No data is downloaded automatically.",
        "variables": [], "date_start": None, "date_end": None,
        "source_url": "https://nlsp.nasa.gov/", "api_url": None, "retrieval": "catalog-only", "retrieved_at": None,
        "notice": "Link only.",
    },
]


def _parse_radlab(text: str, delimiter: str) -> list[dict]:
    rows = list(csv.DictReader(io.StringIO(text.strip()), delimiter=delimiter))
    return rows


def _store_radlab_rows(db: Session, dataset_id: str, rows: list[dict]) -> int:
    db.query(NasaObservation).filter_by(dataset_id=dataset_id).delete()
    n = 0
    for r in rows:
        for var, unit in RADLAB_UNITS.items():
            raw = r.get(var)
            if raw in (None, "", "NA"):
                continue
            try:
                val = float(raw)
            except ValueError:
                continue
            db.add(NasaObservation(dataset_id=dataset_id, timestamp=r["timestamp"].strip('"'), variable=var,
                                   value=val, unit=unit,
                                   series=f"{r.get('module', '').strip(chr(34))} · {r.get('instrument_id', '').strip(chr(34))}",
                                   extra={k: v for k, v in r.items() if k not in RADLAB_UNITS}))
            n += 1
    return n


def seed_catalog(db: Session) -> None:
    for entry in CATALOG:
        data = {k: v for k, v in entry.items() if not k.startswith("_")}
        existing = db.get(NasaDataset, entry["id"])
        if existing is None:
            db.add(NasaDataset(**data))
            if entry.get("_cache_file"):
                text = (NASA_CACHE_DIR / entry["_cache_file"]).read_text()
                db.flush()
                _store_radlab_rows(db, entry["id"], _parse_radlab(text, "\t"))
    db.commit()


def refresh_live(db: Session, timeout: float = 15.0) -> dict:
    """Try live NASA queries. Never raises — returns a per-source status report."""
    report = {"attempted_at": datetime.now(timezone.utc).isoformat(), "sources": []}
    if not NASA_LIVE_ENABLED:
        report["sources"].append({"id": "*", "ok": False, "message": "Live NASA access disabled (SPACELINGS_NASA_LIVE=0)."})
        return report
    import httpx
    ds = db.get(NasaDataset, "RADLAB-ISS-REM-2019-12")
    try:
        resp = httpx.get(RADLAB_SNAPSHOT_QUERY, timeout=timeout)
        resp.raise_for_status()
        rows = _parse_radlab(resp.text, "\t")
        n = _store_radlab_rows(db, ds.id, rows)
        ds.retrieval, ds.retrieved_at = "live", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        ds.notice = "Refreshed live from the NASA RadLab Data API. Values are unmodified from NASA's response."
        report["sources"].append({"id": ds.id, "ok": True, "message": f"{n} observations refreshed from RadLab."})
    except Exception as exc:  # network blocked, NASA down, format change...
        report["sources"].append({"id": ds.id, "ok": False,
                                  "message": f"RadLab unreachable ({type(exc).__name__}); keeping bundled NASA snapshot."})
    cat = db.get(NasaDataset, "OSDR-STUDY-CATALOG")
    try:
        resp = httpx.get(OSDR_BIODATA_API + "datasets/", timeout=timeout)
        resp.raise_for_status()
        listing = resp.json()
        cat.retrieval, cat.retrieved_at = "live", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        cat.notice = f"{len(listing)} OSDR studies listed by the Biological Data API at last refresh."
        report["sources"].append({"id": cat.id, "ok": True, "message": cat.notice})
    except Exception as exc:
        report["sources"].append({"id": cat.id, "ok": False, "message": f"OSDR API unreachable ({type(exc).__name__})."})
    db.commit()
    return report


def import_file(db: Session, *, filename: str, content: bytes, dataset_id: str, name: str, nasa_source: str,
                mission_or_study: str, source_url: str, units: dict[str, str]) -> NasaDataset:
    """Import a CSV/TSV/JSON export from a NASA tool. Requires a timestamp-like column; every other numeric
    column becomes a variable. Units come from the user (as stated in the NASA export) — never guessed."""
    text = content.decode("utf-8-sig")
    if filename.lower().endswith(".json"):
        data = json.loads(text)
        rows = data if isinstance(data, list) else data.get("data") or data.get("rows") or []
        rows = [{str(k): ("" if v is None else str(v)) for k, v in r.items()} for r in rows]
    else:
        lines = [ln for ln in text.splitlines() if ln.strip() and not ln.startswith("#")]
        delim = "\t" if "\t" in lines[0] else ","
        rows = list(csv.DictReader(lines, delimiter=delim))
    if not rows:
        raise ValueError("File contains no rows.")
    cols = list(rows[0].keys())
    ts_col = next((c for c in cols if c.strip('"').lower() in ("timestamp", "time", "date", "datetime", "utc", "day")), None)
    if ts_col is None:
        raise ValueError(f"No timestamp/date column found. Columns: {cols}")
    numeric = []
    for c in cols:
        if c == ts_col:
            continue
        vals = [r[c] for r in rows if r.get(c) not in (None, "", "NA")]
        try:
            [float(v) for v in vals[:50]]
            if vals:
                numeric.append(c)
        except ValueError:
            pass
    if not numeric:
        raise ValueError("No numeric columns found to import.")
    ds = db.get(NasaDataset, dataset_id)
    if ds is None:
        ds = NasaDataset(id=dataset_id, name=name, nasa_source=nasa_source, mission_or_study=mission_or_study,
                         source_url=source_url, retrieval="imported")
        db.add(ds)
    ds.retrieval, ds.retrieved_at = "imported", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    ds.variables = [{"name": c, "unit": units.get(c, "unit not stated"), "description": "Imported column"} for c in numeric]
    stamps = sorted(r[ts_col].strip('"') for r in rows)
    ds.date_start, ds.date_end = stamps[0][:10], stamps[-1][:10]
    ds.notice = f"Imported from '{filename}'. Verify units against the original NASA source."
    db.flush()
    db.query(NasaObservation).filter_by(dataset_id=dataset_id).delete()
    for r in rows:
        for c in numeric:
            if r.get(c) in (None, "", "NA"):
                continue
            db.add(NasaObservation(dataset_id=dataset_id, timestamp=r[ts_col].strip('"'), variable=c,
                                   value=float(r[c]), unit=units.get(c, "unit not stated"), series=c))
    db.commit()
    return ds
