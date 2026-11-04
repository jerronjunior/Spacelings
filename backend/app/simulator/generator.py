"""SPACELINGS simulated astronaut data generator.

ILLUSTRATIVE SYNTHETIC READINGS — NOT CLINICALLY VALIDATED PHYSIOLOGICAL
SIMULATIONS. Every row is labelled source_type = "SIMULATED".

Cadence:
  heart_rate        every 30 min (lower during the sleep window, daily exercise block 10:00-11:00 UTC)
  spo2              every 2 h
  body_temperature  every 2 h (small day/night swing)
  sleep_duration    once per day, recorded at wake-up (07:00 UTC)
  fatigue_score     once per day, recorded at 08:00 UTC (self-rated 1-10)

Scenarios (the change starts near the end of the period so a baseline exists first):
  normal, elevated_heart_rate, reduced_sleep, increased_fatigue, multiple_changes

CLI:
  python -m app.simulator.generator --days 30 --seed 42 --format csv --out data/simulated
"""
from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from ..catalog import MEASUREMENTS

SCENARIOS = ("normal", "elevated_heart_rate", "reduced_sleep", "increased_fatigue", "multiple_changes")
DISCLAIMER = "SIMULATED: illustrative synthetic readings, not clinically validated physiological simulations."


@dataclass
class Profile:
    astronaut_id: str
    scenario: str
    resting_hr: float
    spo2: float
    temp: float
    sleep_h: float
    fatigue: float


DEFAULT_CREW = [
    ("SIM-01", "normal"),
    ("SIM-02", "elevated_heart_rate"),
    ("SIM-03", "reduced_sleep"),
    ("SIM-04", "increased_fatigue"),
    ("SIM-05", "multiple_changes"),
]


def make_profile(astronaut_id: str, scenario: str, seed: int = 42) -> Profile:
    """Deterministic per-astronaut profile: the same ID and seed always give the same person."""
    rng = np.random.default_rng([seed, sum(ord(c) * (i + 1) for i, c in enumerate(astronaut_id))])
    return Profile(astronaut_id, scenario,
                   resting_hr=float(rng.uniform(58, 68)), spo2=float(rng.uniform(97.0, 98.5)),
                   temp=float(rng.uniform(36.55, 36.85)), sleep_h=float(rng.uniform(6.9, 7.6)),
                   fatigue=float(rng.uniform(2.5, 3.5)))


def _row(p: Profile, ts: datetime, mtype: str, value: float, scenario: str) -> dict:
    return {"timestamp_utc": ts.strftime("%Y-%m-%dT%H:%M:%SZ"), "astronaut_id": p.astronaut_id,
            "measurement_type": mtype, "value": value, "unit": MEASUREMENTS[mtype]["unit"],
            "scenario": scenario, "source_type": "SIMULATED"}


def generate(p: Profile, days: int = 30, end: datetime | None = None, seed: int = 0,
             effect_scenario: str | None = None, only_since: datetime | None = None) -> list[dict]:
    """Generate time-series readings for one astronaut ending at `end` (UTC).

    effect_scenario overrides which change is applied (used by the live demo).
    only_since returns only rows at/after that time (used to inject recent data).
    """
    rng = np.random.default_rng(seed)
    end = (end or datetime.now(timezone.utc)).replace(tzinfo=None, second=0, microsecond=0)
    end = end - timedelta(minutes=end.minute % 30)
    start = end - timedelta(days=days)
    sc = effect_scenario or p.scenario
    hr_on = sc in ("elevated_heart_rate", "multiple_changes")
    sleep_on = sc in ("reduced_sleep", "multiple_changes")
    fatigue_on = sc in ("increased_fatigue", "multiple_changes")
    hr_onset = end - timedelta(hours=30)
    rows: list[dict] = []

    t = start
    while t <= end:
        h = t.hour + t.minute / 60
        asleep = h >= 23 or h < 7
        hr = p.resting_hr + (-6 if asleep else 4) + rng.normal(0, 2.5)
        if 10 <= h < 11:  # daily exercise block on the treadmill / cycle ergometer
            hr += rng.uniform(25, 45)
        if hr_on and t >= hr_onset:
            hr += rng.uniform(16, 24)
        rows.append(_row(p, t, "heart_rate", round(hr), sc if (hr_on and t >= hr_onset) else "normal"))
        if t.minute == 0 and t.hour % 2 == 0:
            spo2 = min(100.0, p.spo2 + rng.normal(0, 0.5))
            rows.append(_row(p, t, "spo2", round(spo2, 1), "normal"))
            temp = p.temp + (-0.25 if asleep else 0.1) + rng.normal(0, 0.08)
            rows.append(_row(p, t, "body_temperature", round(temp, 2), "normal"))
        t += timedelta(minutes=30)

    day = start.replace(hour=0, minute=0)
    while day <= end:
        wake, rate = day.replace(hour=7), day.replace(hour=8)
        nights_left = (end - wake).days  # 0 for the most recent night
        if start <= wake <= end:
            s = p.sleep_h + rng.normal(0, 0.3)
            changed = sleep_on and nights_left <= 1
            if changed:
                s = rng.uniform(4.6, 5.4)
            rows.append(_row(p, wake, "sleep_duration", round(float(np.clip(s, 0, 16)), 2), sc if changed else "normal"))
        if start <= rate <= end:
            f = p.fatigue + rng.normal(0, 0.5)
            changed = fatigue_on and (end - rate).days <= 1
            if changed:
                f = rng.uniform(7, 8.5)
            rows.append(_row(p, rate, "fatigue_score", int(np.clip(round(f), 1, 10)), sc if changed else "normal"))
        day += timedelta(days=1)

    rows.sort(key=lambda r: r["timestamp_utc"])
    if only_since is not None:
        cut = only_since.strftime("%Y-%m-%dT%H:%M:%SZ")
        rows = [r for r in rows if r["timestamp_utc"] >= cut]
    return rows


def generate_crew(days: int = 30, seed: int = 42, end: datetime | None = None, crew=DEFAULT_CREW) -> list[dict]:
    out: list[dict] = []
    for i, (aid, sc) in enumerate(crew):
        out += generate(make_profile(aid, sc, seed), days=days, end=end, seed=seed + i + 1)
    return out


def export(rows: list[dict], out_dir: Path, fmt: str = "csv") -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = out_dir / f"spacelings_simulated_{stamp}.{fmt}"
    if fmt == "csv":
        with path.open("w", newline="") as fh:
            fh.write(f"# {DISCLAIMER}\n")
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
    else:
        path.write_text(json.dumps({"label": "SIMULATED", "disclaimer": DISCLAIMER, "readings": rows}, indent=1))
    return path


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate SIMULATED astronaut health readings")
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--seed", type=int, default=42, help="same seed = same data (repeatable scenarios)")
    ap.add_argument("--format", choices=("csv", "json"), default="csv")
    ap.add_argument("--out", default="data/simulated")
    a = ap.parse_args()
    rows = generate_crew(days=a.days, seed=a.seed)
    path = export(rows, Path(a.out), a.format)
    print(f"Wrote {len(rows)} SIMULATED readings to {path}")


if __name__ == "__main__":
    main()
