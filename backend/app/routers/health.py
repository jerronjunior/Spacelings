"""Astronauts, readings, check-ins, analysis, alerts and mission overview."""
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..catalog import MEASUREMENTS, SOURCE_TYPES
from ..db import get_db
from ..engine.crew_context import CHECKLISTS, CONFIG
from ..models import Alert, AlertNote, Astronaut, CheckIn, Measurement, User
from ..schemas import AnalyzeIn, BulkIn, CheckInIn, NoteIn, ReadingIn
from ..security import current_user, ensure_can_access, require_roles
from ..services import (comm_status, iso, latest_by_type, now_utc, run_analysis, serialize_alert, serialize_astronaut,
                        serialize_checkin, serialize_measurement)

router = APIRouter()
CONTROL = ("mission_control", "admin")


def _astro(db: Session, aid: str) -> Astronaut:
    a = db.get(Astronaut, aid)
    if not a:
        raise HTTPException(404, f"Astronaut {aid} not found")
    return a


# ---------------------------------------------------------------- reference
@router.get("/meta", tags=["Reference"], summary="Measurement types, source types, engine rules and checklists")
def meta():
    return {"measurements": {k: {**v, "plausible_range": list(v["plausible_range"])} for k, v in MEASUREMENTS.items()},
            "source_types": SOURCE_TYPES, "engine_config": CONFIG, "checklists": CHECKLISTS}


# ---------------------------------------------------------------- astronauts
@router.get("/astronauts", tags=["Astronauts"], summary="List astronauts (astronauts only see themselves)")
def list_astronauts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = db.query(Astronaut)
    if user.role == "astronaut":
        q = q.filter(Astronaut.id == user.astronaut_id)
    return [serialize_astronaut(db, a) for a in q.order_by(Astronaut.id).all()]


@router.get("/astronauts/{aid}", tags=["Astronauts"], summary="Astronaut profile with mission and baseline")
def get_astronaut(aid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ensure_can_access(user, aid)
    out = serialize_astronaut(db, _astro(db, aid))
    analysis = run_analysis(db, aid, persist=False)
    out["baseline"] = {r["indicator"]: r["baseline"] for r in analysis["indicators"]}
    out["indicator_status"] = {r["indicator"]: r["status"] for r in analysis["indicators"]}
    out["counts"] = {"measurements": db.query(Measurement).filter_by(astronaut_id=aid).count(),
                     "checkins": db.query(CheckIn).filter_by(astronaut_id=aid).count(),
                     "alerts": db.query(Alert).filter_by(astronaut_id=aid).count()}
    return out


# ---------------------------------------------------------------- readings
@router.get("/readings/latest", tags=["Health readings"], summary="Latest reading of each type")
def readings_latest(astronaut_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ensure_can_access(user, astronaut_id)
    _astro(db, astronaut_id)
    return {"astronaut_id": astronaut_id, "latest": latest_by_type(db, astronaut_id), "server_time": iso(now_utc())}


@router.get("/readings/history", tags=["Health readings"], summary="Reading history, optionally downsampled")
def readings_history(astronaut_id: str, type: str | None = None, hours: int = Query(168, ge=1, le=24 * 90),
                     source_type: Literal["SIMULATED", "MANUAL", "DEVICE"] | None = None,
                     max_points: int = Query(240, ge=10, le=5000),
                     user: User = Depends(current_user), db: Session = Depends(get_db)):
    ensure_can_access(user, astronaut_id)
    if type and type not in MEASUREMENTS:
        raise HTTPException(422, f"Unknown measurement type '{type}'")
    q = db.query(Measurement).filter(Measurement.astronaut_id == astronaut_id,
                                     Measurement.timestamp >= now_utc() - timedelta(hours=hours))
    if type:
        q = q.filter(Measurement.type == type)
    if source_type:
        q = q.filter(Measurement.source_type == source_type)
    rows = q.order_by(Measurement.timestamp).all()
    series: dict[str, list] = {}
    for m in rows:
        series.setdefault(m.type, []).append(m)
    out = {}
    for t, ms in series.items():
        out[t] = _downsample(ms, max_points)
    return {"astronaut_id": astronaut_id, "hours": hours, "series": out}


def _downsample(ms: list[Measurement], max_points: int) -> list[dict]:
    """Bucket-average long series for charts. Manual/device points are always kept individually so a
    real measurement is never blended with simulated ones."""
    if len(ms) <= max_points:
        return [serialize_measurement(m) for m in ms]
    keep = [serialize_measurement(m) for m in ms if m.source_type != "SIMULATED"]
    sim = [m for m in ms if m.source_type == "SIMULATED"]
    size = max(1, len(sim) // max_points + 1)
    for i in range(0, len(sim), size):
        b = sim[i:i + size]
        mid = b[len(b) // 2]
        d = serialize_measurement(mid)
        d.update(value=round(sum(x.value for x in b) / len(b), 2), id=None, aggregated=len(b))
        keep.append(d)
    return sorted(keep, key=lambda d: d["timestamp"])


def _check_source(user: User, r: ReadingIn):
    ensure_can_access(user, r.astronaut_id)
    if r.source_type == "SIMULATED" and user.role != "admin":
        raise HTTPException(403, "Only the simulator/admin may upload SIMULATED readings")


def _insert_reading(db: Session, r: ReadingIn) -> str:
    if r.client_uid and db.query(Measurement.id).filter_by(client_uid=r.client_uid).first():
        return "duplicate"
    db.add(Measurement(astronaut_id=r.astronaut_id, timestamp=r.timestamp, type=r.type, value=r.value, unit=r.unit,
                       source_type=r.source_type, quality=r.quality, client_uid=r.client_uid))
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return "duplicate"
    return "accepted"


@router.post("/readings", tags=["Health readings"], status_code=201, summary="Store one reading")
def post_reading(r: ReadingIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _check_source(user, r)
    _astro(db, r.astronaut_id)
    status = _insert_reading(db, r)
    db.get(Astronaut, r.astronaut_id).last_sync_at = now_utc()
    db.commit()
    return {"status": status, "client_uid": r.client_uid}


@router.post("/readings/bulk", tags=["Health readings"], summary="Store many readings (offline sync). Duplicates by client_uid are skipped")
def post_bulk(body: BulkIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    res = {"accepted": 0, "duplicate": 0, "results": []}
    touched = set()
    for r in body.readings:
        _check_source(user, r)
        _astro(db, r.astronaut_id)
        s = _insert_reading(db, r)
        res[s] += 1
        res["results"].append({"client_uid": r.client_uid, "status": s})
        touched.add(r.astronaut_id)
    for aid in touched:
        db.get(Astronaut, aid).last_sync_at = now_utc()
    db.commit()
    return res


# ---------------------------------------------------------------- check-ins
@router.post("/checkins", tags=["Daily check-in"], status_code=201, summary="Submit a daily health check-in")
def post_checkin(body: CheckInIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ensure_can_access(user, body.astronaut_id)
    _astro(db, body.astronaut_id)
    if body.client_uid:
        dup = db.query(CheckIn).filter_by(client_uid=body.client_uid).first()
        if dup:
            return {"status": "duplicate", "checkin": _checkin_out(db, dup)}
    measured = [k for k in MEASUREMENTS if getattr(body, k) is not None]
    c = CheckIn(astronaut_id=body.astronaut_id, timestamp=body.timestamp, wellbeing=body.wellbeing, notes=body.notes,
                measured_fields=measured, client_uid=body.client_uid, created_offline=body.created_offline)
    db.add(c)
    db.flush()
    for k in measured:  # only values the astronaut actually entered become measurements
        db.add(Measurement(astronaut_id=body.astronaut_id, timestamp=body.timestamp, type=k, value=float(getattr(body, k)),
                           unit=MEASUREMENTS[k]["unit"], source_type="MANUAL", checkin_id=c.id,
                           client_uid=f"{body.client_uid}:{k}" if body.client_uid else None))
    db.get(Astronaut, body.astronaut_id).last_sync_at = now_utc()
    db.commit()
    return {"status": "accepted", "checkin": _checkin_out(db, c)}


def _checkin_out(db: Session, c: CheckIn) -> dict:
    vals = {m.type: m.value for m in db.query(Measurement).filter_by(checkin_id=c.id).all()}
    return serialize_checkin(c, vals)


@router.get("/checkins/{aid}", tags=["Daily check-in"], summary="Check-in history")
def get_checkins(aid: str, limit: int = Query(60, le=500), user: User = Depends(current_user), db: Session = Depends(get_db)):
    ensure_can_access(user, aid)
    rows = db.query(CheckIn).filter_by(astronaut_id=aid).order_by(CheckIn.timestamp.desc()).limit(limit).all()
    return [_checkin_out(db, c) for c in rows]


# ---------------------------------------------------------------- analysis
@router.post("/analysis/analyze", tags=["Crew Context Engine"], summary="Run the engine and create/update an alert")
def analyze(body: AnalyzeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ensure_can_access(user, body.astronaut_id)
    _astro(db, body.astronaut_id)
    return run_analysis(db, body.astronaut_id, persist=True)


@router.get("/analysis/{aid}", tags=["Crew Context Engine"], summary="Current engine view (read-only, no alert created)")
def get_analysis(aid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ensure_can_access(user, aid)
    _astro(db, aid)
    return run_analysis(db, aid, persist=False)


# ---------------------------------------------------------------- alerts
@router.get("/alerts", tags=["Alerts"], summary="List alerts with filters")
def list_alerts(astronaut_id: str | None = None, severity: Literal["info", "caution", "warning"] | None = None,
                status: Literal["open", "acknowledged"] | None = None, limit: int = Query(100, le=500),
                user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = db.query(Alert)
    if user.role == "astronaut":
        q = q.filter(Alert.astronaut_id == user.astronaut_id)
    elif astronaut_id:
        q = q.filter(Alert.astronaut_id == astronaut_id)
    if severity:
        q = q.filter(Alert.severity == severity)
    if status:
        q = q.filter(Alert.status == status)
    return [serialize_alert(a) for a in q.order_by(Alert.created_at.desc()).limit(limit).all()]


def _alert(db: Session, user: User, alert_id: int) -> Alert:
    a = db.get(Alert, alert_id)
    if not a:
        raise HTTPException(404, "Alert not found")
    ensure_can_access(user, a.astronaut_id)
    return a


@router.get("/alerts/{alert_id}", tags=["Alerts"], summary="Alert details")
def get_alert(alert_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return serialize_alert(_alert(db, user, alert_id))


@router.post("/alerts/{alert_id}/acknowledge", tags=["Alerts"], summary="Acknowledge an alert")
def ack_alert(alert_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _alert(db, user, alert_id)
    if a.status != "acknowledged":
        a.status, a.acknowledged_by, a.acknowledged_at = "acknowledged", user.display_name, now_utc()
        db.commit()
    return serialize_alert(a)


@router.post("/alerts/{alert_id}/notes", tags=["Alerts"], status_code=201, summary="Add an operator note")
def add_note(alert_id: int, body: NoteIn, user: User = Depends(require_roles(*CONTROL)), db: Session = Depends(get_db)):
    a = _alert(db, user, alert_id)
    db.add(AlertNote(alert_id=a.id, author=user.display_name, text=body.text))
    db.commit()
    db.refresh(a)
    return serialize_alert(a)


# ---------------------------------------------------------------- mission control
@router.get("/overview", tags=["Mission Control"], summary="Mission overview for mission control")
def overview(user: User = Depends(require_roles(*CONTROL)), db: Session = Depends(get_db)):
    crew = [serialize_astronaut(db, a) for a in db.query(Astronaut).order_by(Astronaut.id).all()]
    alerts = db.query(Alert).all()
    latest_sync = sorted((c for c in crew if c["last_sync_at"]), key=lambda c: c["last_sync_at"], reverse=True)
    recent = (db.query(Measurement).filter(Measurement.timestamp >= now_utc() - timedelta(hours=1))
              .order_by(Measurement.received_at.desc()).limit(12).all())
    missions = {c["mission"]["id"]: c["mission"] for c in crew}
    return {
        "total_astronauts": len(crew), "active_missions": sum(1 for m in missions.values() if m["status"] == "active"),
        "missions": list(missions.values()),
        "attention": [c for c in crew if c["health_status"] != "nominal"],
        "total_alerts": len(alerts), "open_alerts": sum(a.status == "open" for a in alerts),
        "alerts_by_severity": {s: sum(a.severity == s and a.status == "open" for a in alerts) for s in ("info", "caution", "warning")},
        "communication": [{"astronaut_id": c["id"], "callsign": c["callsign"], "status": c["comm_status"],
                           "last_sync_at": c["last_sync_at"]} for c in latest_sync],
        "latest_measurements": [serialize_measurement(m) for m in recent],
        "crew": crew, "server_time": iso(now_utc()),
    }
