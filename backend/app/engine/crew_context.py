"""CREW CONTEXT ENGINE
=====================

Transparent, configurable anomaly detection against each astronaut's own
personal baseline. Workflow:

1. Take stored readings for one astronaut.
2. Drop readings flagged with uncertain quality.
3. Build a personal baseline per indicator from an older window
   (median and MAD-based robust spread).
4. Look at the recent window and compute robust z-scores.
5. Flag an indicator only if the change is SUSTAINED (a configurable share of
   recent readings lies beyond the baseline range in the direction of concern).
6. Missing or stale indicators are reported as "not analysed" — never as abnormal.
7. Combine changed indicators into one explanation + predefined checklist.

Nothing here is a diagnosis or a clinical threshold. All rules live in
config.json and checklists.json so the team can inspect and tune them.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from ..catalog import MEASUREMENTS

_HERE = Path(__file__).resolve().parent
CONFIG = json.loads((_HERE / "config.json").read_text())
CHECKLISTS = json.loads((_HERE / "checklists.json").read_text())

MAD_TO_SIGMA = 1.4826  # makes MAD comparable to a standard deviation

PHRASES = {
    "heart_rate": "heart-rate readings are above the personal baseline",
    "spo2": "blood-oxygen readings are below the personal baseline",
    "body_temperature": "body-temperature readings are above the personal baseline",
    "sleep_duration": "sleep duration has decreased",
    "fatigue_score": "fatigue has increased",
}
CHECKLIST_FOR = {
    "heart_rate": "CL-HR-01", "spo2": "CL-SPO2-01", "body_temperature": "CL-TEMP-01",
    "sleep_duration": "CL-SLEEP-01", "fatigue_score": "CL-FATIGUE-01",
}
NUMBER_WORDS = {1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five"}


@dataclass
class Baseline:
    median: float
    scale: float
    n: int
    low: float
    high: float
    start: str | None
    end: str | None


def _fmt(v: float, indicator: str) -> str:
    if indicator in ("heart_rate", "spo2"):
        return f"{v:.0f}"
    if indicator == "fatigue_score":
        return f"{v:.1f}".rstrip("0").rstrip(".")
    return f"{v:.1f}"


def compute_baseline(values: pd.Series, scale_floor: float, z: float) -> tuple[float, float]:
    med = float(np.median(values))
    mad = float(np.median(np.abs(values - med)))
    scale = max(MAD_TO_SIGMA * mad, scale_floor)
    return med, scale


def analyse_indicator(df: pd.DataFrame, indicator: str, as_of: datetime, cfg: dict = CONFIG) -> dict:
    """Analyse one indicator. `df` columns: timestamp (naive UTC), value, source_type, quality."""
    icfg = cfg["indicators"][indicator]
    bcfg = cfg["baseline"]
    zt = cfg["robust_z_threshold"]
    meta = MEASUREMENTS[indicator]
    daily = meta["cadence"] == "daily"
    out = {
        "indicator": indicator, "label": meta["label"], "unit": meta["unit"],
        "direction": icfg["direction"], "status": "no_data", "baseline": None, "recent": None,
        "sources": [], "message": "No readings available.",
    }
    d = df[(df["type"] == indicator) & (df["quality"] == "good") & (df["timestamp"] <= as_of)].sort_values("timestamp")
    if d.empty:
        return out
    out["sources"] = sorted(d["source_type"].unique().tolist())
    latest = d.iloc[-1]
    age_h = (as_of - latest["timestamp"]).total_seconds() / 3600
    out["latest"] = {"value": float(latest["value"]), "at": latest["timestamp"].isoformat() + "Z",
                     "source_type": latest["source_type"], "age_hours": round(age_h, 1)}
    if age_h > icfg["stale_after_hours"]:
        out["status"] = "stale"
        out["message"] = (f"Latest reading is {age_h:.0f} h old (freshness limit {icfg['stale_after_hours']} h). "
                          "Not analysed — stale data is not treated as a health change.")
        return out

    lookback_start = as_of - timedelta(days=bcfg["lookback_days"])
    if daily:
        recent = d.tail(icfg["recent_days"])
        recent = recent[recent["timestamp"] >= as_of - timedelta(hours=24 * icfg["recent_days"] + 12)]
        base = d[(d["timestamp"] >= lookback_start) & (d["timestamp"] < (recent["timestamp"].min() if len(recent) else as_of))]
        min_base = bcfg["min_points_daily"]
    else:
        recent = d[d["timestamp"] > as_of - timedelta(hours=icfg["recent_hours"])]
        base = d[(d["timestamp"] >= lookback_start) & (d["timestamp"] < as_of - timedelta(hours=bcfg["exclude_recent_hours"]))]
        min_base = bcfg["min_points_continuous"]

    if len(base) < min_base:
        out["status"] = "insufficient_baseline"
        out["message"] = f"Personal baseline needs at least {min_base} readings (have {len(base)})."
        return out

    med, scale = compute_baseline(base["value"], icfg["scale_floor"], zt)
    bl = Baseline(med, scale, len(base), med - zt * scale, med + zt * scale,
                  base["timestamp"].min().isoformat() + "Z", base["timestamp"].max().isoformat() + "Z")
    out["baseline"] = {k: (round(v, 2) if isinstance(v, float) else v) for k, v in bl.__dict__.items()}

    if len(recent) < icfg["min_recent_points"]:
        out["status"] = "insufficient_recent"
        out["message"] = f"Need at least {icfg['min_recent_points']} recent readings (have {len(recent)})."
        return out

    zs = (recent["value"] - med) / scale
    beyond = (zs > zt) if icfg["direction"] == "up" else (zs < -zt)
    frac = float(beyond.mean())
    rmed = float(np.median(recent["value"]))
    z_med = (rmed - med) / scale
    out["recent"] = {
        "median": round(rmed, 2), "n": int(len(recent)), "n_beyond": int(beyond.sum()),
        "fraction_beyond": round(frac, 2), "robust_z": round(z_med, 2),
        "values": [round(float(v), 2) for v in recent["value"].tolist()] if daily else None,
        "window": f"last {icfg['recent_days']} days" if daily else f"last {icfg['recent_hours']} h",
    }
    sustained = frac >= icfg["sustained_fraction"]
    out["status"] = "changed" if sustained else "within_baseline"
    out["message"] = _indicator_sentence(indicator, out, bl) if sustained else "Recent readings are consistent with the personal baseline."
    return out


def _indicator_sentence(ind: str, r: dict, bl: Baseline) -> str:
    unit = "/10" if ind == "fatigue_score" else " " + MEASUREMENTS[ind]["unit"]
    rec = r["recent"]
    side = "above" if r["direction"] == "up" else "below"
    rng = f"{_fmt(bl.low, ind)}–{_fmt(bl.high, ind)}{unit}"
    if rec["values"] is not None:
        vals = ", ".join(f"{_fmt(v, ind)}{unit}" for v in rec["values"])
        what = "nights" if ind == "sleep_duration" else "days"
        return (f"{r['label']}: the {rec['window'].replace('days', what)} ({vals}) were {side} the personal baseline range "
                f"({rng}; baseline median {_fmt(bl.median, ind)}{unit}).")
    return (f"{r['label']}: {rec['n_beyond']} of {rec['n']} readings in the {rec['window']} "
            f"({rec['fraction_beyond']:.0%}) were {side} the personal baseline range ({rng}). "
            f"Recent median {_fmt(rec['median'], ind)}{unit} vs baseline median {_fmt(bl.median, ind)}{unit}.")


def isolation_forest_signal(df: pd.DataFrame, as_of: datetime, cfg: dict = CONFIG) -> dict | None:
    """Optional multivariate check on daily aggregates. Supporting context only — never raises an alert alone."""
    ic = cfg.get("isolation_forest", {})
    if not ic.get("enabled"):
        return None
    try:
        from sklearn.ensemble import IsolationForest
    except ImportError:
        return None
    d = df[(df["quality"] == "good") & (df["timestamp"] <= as_of)].copy()
    if d.empty:
        return None
    # Complete 24 h windows counted back from as_of (window 0 = the last 24 h), so a partial day never skews the check.
    d["window"] = ((as_of - d["timestamp"]).dt.total_seconds() // 86400).astype(int)
    daily = (d.pivot_table(index="window", columns="type", values="value", aggfunc="median")
             .sort_index(ascending=False))
    daily = daily.loc[:, daily.notna().mean() >= 0.8].dropna(axis=0, how="any")
    if 0 not in daily.index:
        return None
    if len(daily) < ic["min_days"] or daily.shape[1] < 2:
        return None
    model = IsolationForest(contamination=ic["contamination"], random_state=42).fit(daily.values)
    scores = model.decision_function(daily.values)
    flagged = model.predict(daily.values[-1:])[0] == -1
    return {"latest_window": "last 24 h", "latest_day_is_outlier": bool(flagged),
            "score": round(float(scores[-1]), 3), "features": list(daily.columns), "days_used": int(len(daily))}


def analyse(df: pd.DataFrame, as_of: datetime | None = None, cfg: dict = CONFIG) -> dict:
    """Run the full engine. Returns per-indicator results and an alert proposal (or None)."""
    as_of = as_of or datetime.now(timezone.utc).replace(tzinfo=None)
    if not df.empty:
        df = df.copy()
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        if "quality" not in df:
            df["quality"] = "good"
    results = [analyse_indicator(df, ind, as_of, cfg) if not df.empty else
               {"indicator": ind, "label": MEASUREMENTS[ind]["label"], "unit": MEASUREMENTS[ind]["unit"],
                "status": "no_data", "message": "No readings available.", "baseline": None, "recent": None, "sources": []}
               for ind in cfg["indicators"]]
    changed = [r for r in results if r["status"] == "changed"]
    not_analysed = [r for r in results if r["status"] in ("stale", "no_data", "insufficient_baseline", "insufficient_recent")]
    forest = isolation_forest_signal(df, as_of, cfg) if not df.empty else None
    alert = build_alert(changed, not_analysed, forest, cfg) if changed else None
    return {
        "engine": "Crew Context Engine", "version": "1.0", "as_of": as_of.isoformat() + "Z",
        "indicators": results, "changed": [r["indicator"] for r in changed],
        "not_analysed": [{"indicator": r["indicator"], "status": r["status"], "message": r["message"]} for r in not_analysed],
        "multivariate": forest, "alert": alert,
        "disclaimer": "Decision-support prototype. Compares readings to the astronaut's own baseline; does not diagnose.",
    }


def build_alert(changed: list[dict], not_analysed: list[dict], forest: dict | None, cfg: dict = CONFIG) -> dict:
    n = len(changed)
    inds = [r["indicator"] for r in changed]
    severity = cfg["severity_by_indicator_count"][str(min(n, 3))]
    phrases = [PHRASES[i] for i in inds]
    joined = phrases[0] if n == 1 else ", ".join(phrases[:-1]) + (", and " if n > 2 else " and ") + phrases[-1]
    noun = "change" if n == 1 else "changes"
    summary = (f"{NUMBER_WORDS.get(n, str(n))} unusual {noun} detected: {joined}. "
               "Review the latest measurements and follow the appropriate mission health procedure.")
    title = "Unusual Health Pattern Detected" if n >= 2 else f"{changed[0]['label']} Change Detected"
    checklist_id = "CL-MULTI-01" if n >= 2 else CHECKLIST_FOR[inds[0]]
    details = [r["message"] for r in changed]
    if not_analysed:
        details.append("Not analysed: " + "; ".join(f"{r['label']} ({r['status'].replace('_', ' ')})" for r in not_analysed) + ".")
    if forest and forest["latest_day_is_outlier"]:
        details.append("Supporting signal: the multivariate Isolation Forest check also rates the latest day as unusual "
                       "compared with previous days.")
    sources = sorted({s for r in changed for s in r["sources"]})
    if "SIMULATED" in sources:
        details.append("Note: some evidence comes from SIMULATED readings.")
    evidence = [{
        "indicator": r["indicator"], "label": r["label"], "unit": r["unit"], "direction": r["direction"],
        "current": r["latest"]["value"], "current_at": r["latest"]["at"], "recent_median": r["recent"]["median"],
        "recent_values": r["recent"]["values"], "baseline_median": r["baseline"]["median"],
        "baseline_low": r["baseline"]["low"], "baseline_high": r["baseline"]["high"],
        "robust_z": r["recent"]["robust_z"], "fraction_beyond": r["recent"]["fraction_beyond"],
        "window": r["recent"]["window"], "sources": r["sources"],
    } for r in changed]
    return {
        "title": title, "severity": severity, "indicators": inds, "summary": summary,
        "explanation": summary + "\n\n" + "\n".join(f"• {d}" for d in details),
        "evidence": evidence, "checklist_id": checklist_id,
        "checklist": CHECKLISTS[checklist_id]["steps"], "checklist_title": CHECKLISTS[checklist_id]["title"],
        "data_sources": sources,
    }
