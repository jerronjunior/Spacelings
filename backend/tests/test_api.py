"""End-to-end API tests. Run from backend/:  python -m pytest -q"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

_tmp = tempfile.mkdtemp()
os.environ["SPACELINGS_DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["SPACELINGS_NASA_LIVE"] = "0"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PW = "spacelings-demo"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def login(client, email):
    r = client.post("/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def now_iso(**delta):
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


def test_auth_and_roles(client):
    assert client.get("/astronauts").status_code == 401
    assert client.post("/auth/login", json={"email": "astronaut@spacelings.demo", "password": "wrong-pass"}).status_code == 401
    a = login(client, "astronaut@spacelings.demo")
    crew = client.get("/astronauts", headers=a).json()
    assert [c["id"] for c in crew] == ["SIM-01"]  # astronauts only see themselves
    assert client.get("/astronauts/SIM-02", headers=a).status_code == 403
    assert client.get("/overview", headers=a).status_code == 403
    mc = login(client, "control@spacelings.demo")
    ov = client.get("/overview", headers=mc).json()
    assert ov["total_astronauts"] == 5 and ov["active_missions"] == 2


def test_register_forgot_reset(client):
    r = client.post("/auth/register", json={"email": "vol@example.org", "password": "longenough1", "display_name": "Vol"})
    assert r.status_code == 200 and r.json()["user"]["astronaut_id"].startswith("VOL-")
    assert client.post("/auth/register", json={"email": "mc@example.org", "password": "longenough1",
                                               "display_name": "MC", "role": "mission_control"}).status_code == 403
    tok = client.post("/auth/forgot-password", json={"email": "vol@example.org"}).json()["demo_reset_token"]
    assert client.post("/auth/reset-password", json={"token": tok, "new_password": "newpassword9"}).status_code == 200
    assert client.post("/auth/login", json={"email": "vol@example.org", "password": "newpassword9"}).status_code == 200


def test_seeded_scenarios_create_expected_alerts(client):
    mc = login(client, "control@spacelings.demo")
    alerts = client.get("/alerts", headers=mc).json()
    by = {a["astronaut_id"]: a for a in alerts}
    assert "SIM-01" not in by  # normal scenario: no alert
    assert by["SIM-02"]["indicators"] == ["heart_rate"]
    assert by["SIM-03"]["indicators"] == ["sleep_duration"]
    assert by["SIM-04"]["indicators"] == ["fatigue_score"]
    assert set(by["SIM-05"]["indicators"]) == {"heart_rate", "sleep_duration", "fatigue_score"}
    assert by["SIM-05"]["severity"] == "warning" and by["SIM-05"]["title"] == "Unusual Health Pattern Detected"
    assert by["SIM-05"]["explanation"].startswith("Three unusual changes detected")
    assert by["SIM-05"]["checklist"] and "SIMULATED" in by["SIM-05"]["data_sources"]


def test_demo_workflow_sim01(client):
    a = login(client, "astronaut@spacelings.demo")
    assert client.post("/analysis/analyze", json={"astronaut_id": "SIM-01"}, headers=a).json()["alert"] is None
    client.post("/demo/step", json={"step": "elevated_heart_rate"}, headers=a)
    r = client.post("/analysis/analyze", json={"astronaut_id": "SIM-01"}, headers=a).json()
    assert r["changed"] == ["heart_rate"]
    client.post("/demo/step", json={"step": "reduced_sleep_fatigue"}, headers=a)
    r = client.post("/analysis/analyze", json={"astronaut_id": "SIM-01"}, headers=a).json()
    assert set(r["changed"]) == {"heart_rate", "sleep_duration", "fatigue_score"}
    rec = r["alert_record"]
    for ev in rec["evidence"]:
        assert {"current", "baseline_median", "baseline_low", "baseline_high"} <= ev.keys()
    # re-running does not duplicate the multi-indicator alert
    client.post("/analysis/analyze", json={"astronaut_id": "SIM-01"}, headers=a)
    multi = [x for x in client.get("/alerts", headers=a).json() if len(x["indicators"]) == 3]
    assert len(multi) == 1
    ack = client.post(f"/alerts/{rec['id']}/acknowledge", headers=a).json()
    assert ack["status"] == "acknowledged"
    mc = login(client, "control@spacelings.demo")
    noted = client.post(f"/alerts/{rec['id']}/notes", json={"text": "Crew contacted"}, headers=mc).json()
    assert noted["notes"][0]["text"] == "Crew contacted"
    assert client.post(f"/alerts/{rec['id']}/notes", json={"text": "x"}, headers=a).status_code == 403


def test_checkin_missing_values_not_stored(client):
    a = login(client, "astronaut@spacelings.demo")
    body = {"astronaut_id": "SIM-01", "timestamp": now_iso(minutes=1), "heart_rate": 64, "fatigue_score": 4,
            "wellbeing": 4, "notes": "fine", "client_uid": "chk-1", "created_offline": True}
    r = client.post("/checkins", json=body, headers=a).json()
    assert r["status"] == "accepted" and set(r["checkin"]["measured_fields"]) == {"heart_rate", "fatigue_score"}
    assert set(r["checkin"]["values"]) == {"heart_rate", "fatigue_score"}  # SpO2/temp/sleep not invented
    assert client.post("/checkins", json=body, headers=a).json()["status"] == "duplicate"
    bad = dict(body, client_uid="chk-2", spo2=140)
    assert client.post("/checkins", json=bad, headers=a).status_code == 422


def test_bulk_sync_dedupe_and_validation(client):
    a = login(client, "astronaut@spacelings.demo")
    rs = [{"astronaut_id": "SIM-01", "timestamp": now_iso(minutes=i), "type": "heart_rate", "value": 70,
           "source_type": "MANUAL", "client_uid": f"q-{i}"} for i in range(3)]
    assert client.post("/readings/bulk", json={"readings": rs}, headers=a).json()["accepted"] == 3
    assert client.post("/readings/bulk", json={"readings": rs}, headers=a).json()["duplicate"] == 3
    sim = dict(rs[0], client_uid="s-1", source_type="SIMULATED")
    assert client.post("/readings", json=sim, headers=a).status_code == 403
    future = dict(rs[0], client_uid="f-1", timestamp=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat())
    assert client.post("/readings", json=future, headers=a).status_code == 422
    hist = client.get("/readings/history?astronaut_id=SIM-01&type=heart_rate&hours=24", headers=a).json()
    sources = {p["source_type"] for p in hist["series"]["heart_rate"]}
    assert sources == {"SIMULATED", "MANUAL"}


def test_stale_data_not_flagged(client):
    a = login(client, "sim02@spacelings.demo")
    from app.db import SessionLocal
    from app.models import Measurement
    with SessionLocal() as db:  # make SIM-02's heart-rate data 10 h old
        db.query(Measurement).filter(Measurement.astronaut_id == "SIM-02", Measurement.type == "heart_rate",
                                     Measurement.timestamp > datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=10)).delete()
        db.commit()
    r = client.get("/analysis/SIM-02", headers=a).json()
    hr = next(i for i in r["indicators"] if i["indicator"] == "heart_rate")
    assert hr["status"] == "stale" and "heart_rate" not in r["changed"]


def test_nasa_data_separate(client):
    mc = login(client, "control@spacelings.demo")
    ds = {d["id"]: d for d in client.get("/nasa/datasets", headers=mc).json()}
    rad = ds["RADLAB-ISS-REM-2019-12"]
    assert rad["observation_count"] == 40 and rad["source_url"].startswith("https://visualization.osdr.nasa.gov")
    env = client.get("/nasa/environment?dataset_id=RADLAB-ISS-REM-2019-12", headers=mc).json()
    assert env["observations"][0] == {"timestamp": "2019-12-05T00:00:00", "variable": "absorbed_dose_rate",
                                      "value": 17.2966666666666, "unit": "μGy/hour", "series": "JPM · REM-JPM1FD4-pre"}
    rep = client.post("/nasa/refresh", headers=mc).json()
    assert rep["sources"][0]["ok"] is False  # live disabled in tests -> cache kept
    csv = b"Date,ISS Temperature,ISS CO2\n2020-01-01,22.1,2.3\n2020-01-02,22.4,2.5\n"
    r = client.post("/nasa/import", headers=mc, files={"file": ("eda.csv", csv, "text/csv")},
                    data={"dataset_id": "eda-test", "name": "EDA test", "mission_or_study": "RR test",
                          "source_url": "https://visualization.osdr.nasa.gov/eda/", "units_json": '{"ISS Temperature": "°C"}'})
    assert r.status_code == 200 and r.json()["observation_count"] == 4
    a = login(client, "astronaut@spacelings.demo")
    assert client.post("/nasa/refresh", headers=a).status_code == 403


def test_simulator_export(client):
    mc = login(client, "control@spacelings.demo")
    r = client.get("/simulator/export?fmt=json&days=2", headers=mc).json()
    assert r["label"] == "SIMULATED" and all(x["source_type"] == "SIMULATED" for x in r["readings"])
    sleeps = [x for x in r["readings"] if x["measurement_type"] == "sleep_duration" and x["astronaut_id"] == "SIM-01"]
    assert 1 <= len(sleeps) <= 3  # daily, not every few minutes
