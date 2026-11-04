"""Shared business logic: seeding, running the engine, serializing rows."""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import DEMO_PASSWORD
from .engine.crew_context import CONFIG, analyse
from .models import Alert, Astronaut, CheckIn, Measurement, Mission, User
from .nasa.sources import seed_catalog
from .security import hash_password
from .simulator.generator import generate, make_profile

SEED = 42


def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt: datetime | None) -> str | None:
    return None if dt is None else dt.replace(microsecond=0).isoformat() + "Z"


CREW = [  # anonymous demo IDs, fictional callsigns
    ("SIM-01", "Orion", "Commander", "LDM-01", "normal"),
    ("SIM-02", "Vega", "Flight Engineer", "LDM-01", "elevated_heart_rate"),
    ("SIM-03", "Lyra", "Mission Specialist", "LDM-01", "reduced_sleep"),
    ("SIM-04", "Altair", "Commander", "LDM-02", "increased_fatigue"),
    ("SIM-05", "Nova", "Science Officer", "LDM-02", "multiple_changes"),
]


# ---------------------------------------------------------------- seeding
def seed_if_empty(db: Session) -> None:
    seed_catalog(db)
    if db.query(Mission).count():
        return
    now = now_utc()
    db.add_all([
        Mission(id="LDM-01", name="Odyssey Long-Duration Analog", vehicle="Deep Space Habitat (simulated)",
                start_date=now - timedelta(days=42), planned_days=180,
                description="Fictional long-duration mission used for the SPACELINGS demo."),
        Mission(id="LDM-02", name="Horizon Lunar Gateway Analog", vehicle="Gateway Habitat (simulated)",
                start_date=now - timedelta(days=33), planned_days=90,
                description="Fictional mission with a second crew for Mission Control monitoring."),
    ])
    for aid, call, role, mid, sc in CREW:
        db.add(Astronaut(id=aid, callsign=call, role_on_mission=role, mission_id=mid, scenario=sc, is_fictional=True))
    db.flush()
    pw = hash_password(DEMO_PASSWORD)
    db.add_all([
        User(email="astronaut@spacelings.demo", display_name="Orion (SIM-01)", password_hash=pw, role="astronaut", astronaut_id="SIM-01"),
        User(email="control@spacelings.demo", display_name="Flight Controller", password_hash=pw, role="mission_control"),
        User(email="admin@spacelings.demo", display_name="Platform Admin", password_hash=pw, role="admin"),
    ] + [User(email=f"{aid.lower().replace('-', '')}@spacelings.demo", display_name=f"{call} ({aid})", password_hash=pw,
              role="astronaut", astronaut_id=aid) for aid, call, *_ in CREW[1:]])
    db.commit()
    regenerate_crew(db)


def _insert_rows(db: Session, rows: list[dict]) -> int:
    objs = [Measurement(astronaut_id=r["astronaut_id"], timestamp=datetime.strptime(r["timestamp_utc"], "%Y-%m-%dT%H:%M:%SZ"),
                        type=r["measurement_type"], value=float(r["value"]), unit=r["unit"], source_type="SIMULATED",
                        scenario=r["scenario"]) for r in rows]
    db.bulk_save_objects(objs)
    return len(objs)


def regenerate_astronaut(db: Session, aid: str, scenario: str, offset: int) -> None:
    db.query(Alert).filter_by(astronaut_id=aid).delete()
    db.query(Measurement).filter_by(astronaut_id=aid).delete()
    db.query(CheckIn).filter_by(astronaut_id=aid).delete()
    now = now_utc()
    _insert_rows(db, generate(make_profile(aid, scenario, SEED), days=30, end=now, seed=SEED + offset))
    a = db.get(Astronaut, aid)
    a.last_sync_at = now - timedelta(minutes=3 + offset * 4)
    a.scenario = scenario


def regenerate_crew(db: Session) -> None:
    for i, (aid, _, _, _, sc) in enumerate(CREW):
        regenerate_astronaut(db, aid, sc, i + 1)
    db.commit()
    for aid, *_ in CREW:
        run_analysis(db, aid)


def demo_step(db: Session, step: str) -> dict:
    """Inject a scenario change into SIM-01's SIMULATED data (demo workflow steps 4-5)."""
    aid, now = "SIM-01", now_utc()
    prof = make_profile(aid, "normal", SEED)
    if step == "elevated_heart_rate":
        since, types, effect = now - timedelta(hours=30), {"heart_rate"}, "elevated_heart_rate"
    else:
        since, types, effect = now - timedelta(hours=49), {"sleep_duration", "fatigue_score"}, "multiple_changes"
    db.query(Measurement).filter(Measurement.astronaut_id == aid, Measurement.source_type == "SIMULATED",
                                 Measurement.type.in_(types), Measurement.timestamp >= since).delete(synchronize_session=False)
    rows = [r for r in generate(prof, days=30, end=now, seed=SEED + 101, effect_scenario=effect, only_since=since)
            if r["measurement_type"] in types]
    n = _insert_rows(db, rows)
    db.get(Astronaut, aid).last_sync_at = now
    db.commit()
    return {"astronaut_id": aid, "step": step, "inserted": n, "source_type": "SIMULATED"}


# ---------------------------------------------------------------- analysis
def readings_frame(db: Session, aid: str, days: int | None = None) -> pd.DataFrame:
    lookback = days or (CONFIG["baseline"]["lookback_days"] + 3)
    q = (db.query(Measurement.timestamp, Measurement.type, Measurement.value, Measurement.source_type, Measurement.quality)
         .filter(Measurement.astronaut_id == aid, Measurement.timestamp >= now_utc() - timedelta(days=lookback)))
    return pd.DataFrame(q.all(), columns=["timestamp", "type", "value", "source_type", "quality"])


def run_analysis(db: Session, aid: str, persist: bool = True) -> dict:
    result = analyse(readings_frame(db, aid), as_of=now_utc())
    result["astronaut_id"] = aid
    proposal = result["alert"]
    if proposal and persist:
        result["alert_record"] = serialize_alert(upsert_alert(db, aid, proposal))
    return result


def upsert_alert(db: Session, aid: str, p: dict) -> Alert:
    """Avoid duplicate alerts: an open alert with the same indicator set in the last N hours is updated instead."""
    fp = hashlib.sha1(f"{aid}|{','.join(sorted(p['indicators']))}".encode()).hexdigest()
    window = now_utc() - timedelta(hours=CONFIG["duplicate_window_hours"])
    existing = (db.query(Alert).filter(Alert.astronaut_id == aid, Alert.fingerprint == fp, Alert.created_at >= window)
                .order_by(Alert.created_at.desc()).first())
    fields = dict(title=p["title"], severity=p["severity"], indicators=p["indicators"], evidence=p["evidence"],
                  explanation=p["explanation"], checklist_id=p["checklist_id"], checklist=p["checklist"],
                  data_sources=p["data_sources"])
    if existing:
        for k, v in fields.items():
            setattr(existing, k, v)
        alert = existing
    else:
        alert = Alert(astronaut_id=aid, fingerprint=fp, **fields)
        db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


# ---------------------------------------------------------------- serializers
def serialize_alert(a: Alert) -> dict:
    return {"id": a.id, "astronaut_id": a.astronaut_id, "created_at": iso(a.created_at), "title": a.title,
            "severity": a.severity, "indicators": a.indicators, "evidence": a.evidence, "explanation": a.explanation,
            "checklist_id": a.checklist_id, "checklist": a.checklist, "data_sources": a.data_sources,
            "status": a.status, "acknowledged_by": a.acknowledged_by, "acknowledged_at": iso(a.acknowledged_at),
            "origin": a.origin,
            "notes": [{"id": n.id, "author": n.author, "text": n.text, "created_at": iso(n.created_at)} for n in a.notes]}


def serialize_measurement(m: Measurement) -> dict:
    return {"id": m.id, "astronaut_id": m.astronaut_id, "timestamp": iso(m.timestamp), "type": m.type, "value": m.value,
            "unit": m.unit, "source_type": m.source_type, "quality": m.quality, "scenario": m.scenario}


def serialize_checkin(c: CheckIn, values: dict) -> dict:
    return {"id": c.id, "astronaut_id": c.astronaut_id, "timestamp": iso(c.timestamp), "wellbeing": c.wellbeing,
            "notes": c.notes, "measured_fields": c.measured_fields, "values": values, "source_type": c.source_type,
            "created_offline": c.created_offline, "received_at": iso(c.received_at)}


def mission_day(m: Mission) -> int:
    return max(1, (now_utc() - m.start_date).days + 1)


def comm_status(last_sync: datetime | None) -> str:
    if last_sync is None:
        return "no_contact"
    age = (now_utc() - last_sync).total_seconds() / 3600
    return "nominal" if age < 1 else "delayed" if age < 6 else "loss_of_signal"


def latest_by_type(db: Session, aid: str) -> dict:
    sub = (db.query(Measurement.type, func.max(Measurement.timestamp).label("ts"))
           .filter(Measurement.astronaut_id == aid).group_by(Measurement.type).subquery())
    rows = (db.query(Measurement).join(sub, (Measurement.type == sub.c.type) & (Measurement.timestamp == sub.c.ts))
            .filter(Measurement.astronaut_id == aid).all())
    return {m.type: serialize_measurement(m) for m in rows}


def serialize_astronaut(db: Session, a: Astronaut, with_status: bool = True) -> dict:
    out = {"id": a.id, "callsign": a.callsign, "role_on_mission": a.role_on_mission, "is_fictional": a.is_fictional,
           "scenario": a.scenario, "last_sync_at": iso(a.last_sync_at), "comm_status": comm_status(a.last_sync_at),
           "mission": {"id": a.mission.id, "name": a.mission.name, "vehicle": a.mission.vehicle,
                       "start_date": iso(a.mission.start_date), "planned_days": a.mission.planned_days,
                       "day": mission_day(a.mission), "status": a.mission.status}}
    if with_status:
        open_alerts = db.query(Alert).filter_by(astronaut_id=a.id, status="open").all()
        rank = {"info": 1, "caution": 2, "warning": 3}
        top = max((x.severity for x in open_alerts), key=lambda s: rank[s], default=None)
        out.update(open_alerts=len(open_alerts), top_severity=top,
                   health_status={None: "nominal", "info": "review", "caution": "attention", "warning": "attention"}[top],
                   latest=latest_by_type(db, a.id))
    return out
