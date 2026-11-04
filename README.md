# SPACELINGS — AI-Powered Astronaut Health Monitoring Platform

**Know Your Baseline. Spot Changes. Act Early.**
NASA Space Apps Challenge 2026 · decision-support prototype · **not a medical device, does not diagnose**

SPACELINGS compares each astronaut's health readings with their **own personal baseline**, flags **sustained**
changes, explains the evidence in plain language and points to a predefined checklist. It keeps working on
board during communication loss and synchronizes automatically when the link returns.

| Part | Technology | Folder |
|---|---|---|
| Astronaut mobile/tablet app | React Native · Expo SDK 58 · TypeScript · Expo Router | `app/` (routes under `src/app/crew`) |
| Mission Control web dashboard | Same Expo app, desktop layout | `app/` (routes under `src/app/control`) |
| Backend REST API | Python · FastAPI · SQLAlchemy | `backend/app` |
| Database | SQLite (swap via `SPACELINGS_DATABASE_URL`) | `backend/data/spacelings.db` |
| Crew Context Engine | NumPy · pandas · scikit-learn | `backend/app/engine` |
| Simulated data generator | Python CLI + API | `backend/app/simulator` |
| NASA research data | OSDR RadLab / Biodata APIs + CSV/JSON import | `backend/app/nasa`, `backend/nasa_cache` |

---

## 1. Quick start (about 5 minutes)

Requirements: **Python 3.11+**, **Node.js 20+**.

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
On first start the database is created and seeded with 2 fictional missions, 5 fictional astronauts
(SIM-01 … SIM-05), 30 days of SIMULATED readings each, demo accounts and the NASA dataset catalogue.
Interactive API docs: **http://localhost:8000/docs**

### App (web, phone or tablet)
```bash
cd app
npm install
npm run web            # opens http://localhost:8081
# or: npx expo start   → scan the QR code with Expo Go on a phone/tablet
```
On a **physical phone**, `localhost` points at the phone itself. On the sign-in screen tap
**Server · change** and enter your computer's LAN address, e.g. `http://192.168.1.20:8000`
(or start Expo with `EXPO_PUBLIC_API_URL=http://192.168.1.20:8000 npx expo start`).

### Demo accounts (password `spacelings-demo`)
| Email | Role |
|---|---|
| astronaut@spacelings.demo | Astronaut SIM-01 (the demo astronaut) |
| sim02@ … sim05@spacelings.demo | Astronauts SIM-02 … SIM-05 |
| control@spacelings.demo | Mission Control |
| admin@spacelings.demo | Admin |

The sign-in screen has one-tap **Demo astronaut** and **Demo Mission Control** buttons. New accounts can be
registered; volunteers get an anonymous ID (`VOL-001`…). Mission Control registration needs the invite code
`SPACEAPPS2026` (change with `SPACELINGS_CONTROL_INVITE`).

### Run the tests
```bash
cd backend && python -m pytest -q        # 9 end-to-end API tests
cd app && npm run typecheck              # TypeScript
```

---

## 2. Demo workflow (judging script)

1. Sign in as **Demo astronaut · SIM-01** → dashboard with normal readings.
2. Metric cards show current values, source badge (SIMULATED) and the difference from the baseline.
3. The 7-day chart shows the **personal baseline band**; the Profile page lists every baseline.
4. In the **Demo console** (bottom of the dashboard) press **Inject** on *elevated heart rate*.
5. Press **Inject** on *reduced sleep + fatigue*.
6. Press **Analyse** → the Crew Context Engine runs on the server.
7. A warning alert *“Unusual Health Pattern Detected”* is created…
8. …and its explanation opens: evidence per indicator (current vs baseline), checklist, acknowledge.
9. **Health** tab → 24 h / 7 d / 30 d history for all five indicators, filter by source.
10. Sign in as **Mission Control** (or another browser window) → **NASA Research**.
11. ISS radiation data (NASA OSDR RadLab) is displayed separately, with its source link.
12. Back as the astronaut, switch on **Simulate communication loss** (Demo console or Profile) → status **OFFLINE**.
    Submit a check-in: it is stored on board, shown as *queued*, and the onboard engine still works.
13. Switch the link back on → status **SYNCING** → **ONLINE**; the queue drains, the ground engine re-analyses,
    and Mission Control sees the check-in marked *created offline*.

**Reset demo** (Demo console) returns SIM-01 to normal; **Regenerate crew data** (Mission Control overview)
refreshes all five astronauts. Simulated readings are anchored to the time they were generated — if the
server has been idle for many hours, readings become *stale* (the engine then reports “not analysed”,
by design). Regenerate before a presentation.

---

## 3. Architecture

```
 Astronaut app (Expo)  ─┐                      ┌─ Crew Context Engine (rules + robust z + Isolation Forest)
  offline queue + cache │   REST + JWT (HTTPS) │
                        ├───────────►  FastAPI ├─ Simulator (SIMULATED readings)
 Mission Control (web) ─┘                      ├─ NASA module (RadLab / OSDR APIs, cache, import)
                                               └─ SQLAlchemy → SQLite (PostgreSQL-ready)
```

**Data provenance.** Every measurement row stores astronaut ID, UTC timestamp, type, value, unit and
`source_type` (`SIMULATED`, `MANUAL` or `DEVICE`). NASA research data lives in separate tables
(`nasa_datasets`, `nasa_observations`) and is never mixed with health measurements. Charts draw
SIMULATED readings as a purple trace and MANUAL/DEVICE readings as distinct markers; downsampling never
blends real and simulated points.

**Roles.** `astronaut` (own data only), `mission_control` (all crew, notes, NASA refresh/import), `admin`
(may upload SIMULATED readings). Passwords are bcrypt-hashed; API calls use JWT bearer tokens.

### Key folders
```
backend/app/main.py            API app, demo + simulator endpoints
backend/app/routers/           auth.py · health.py (readings, check-ins, analysis, alerts, overview) · nasa.py
backend/app/engine/            crew_context.py · config.json (rules) · checklists.json
backend/app/simulator/         generator.py (CLI: python -m app.simulator.generator --help)
backend/app/nasa/sources.py    NASA catalogue, live refresh, cache, import
backend/tests/test_api.py      end-to-end tests
app/src/app/                   routes: login, register, forgot, crew/*, control/*
app/src/components/            design system, charts, shell, dashboards, alerts, demo console
app/src/lib/                   api client + cache, auth, offline sync, onboard engine, theme
```

---

## 4. Crew Context Engine

Transparent and configurable (`backend/app/engine/config.json`):

1. **Personal baseline** per indicator from the last 21 days, excluding the recent window:
   median and MAD → robust spread (`1.4826 × MAD`, with a small numerical floor).
2. **Recent window**: last 24 h for heart rate, SpO₂ and temperature; last 2 days for sleep and fatigue
   (daily measurements).
3. **Robust z-score** of each recent reading against the baseline.
4. **Sustained-change rule**: an indicator changes only if ≥ 60 % of recent continuous readings (100 % of the
   last 2 daily values) lie beyond ±2.5 robust z in the direction of concern. Single readings — e.g. during
   the simulated 10:00 UTC exercise block — never raise an alert.
5. **Freshness & quality**: stale indicators (e.g. heart rate older than 6 h) and readings flagged
   `uncertain` are reported as *not analysed*, never as abnormal. Missing values are never filled in.
6. **Multi-indicator combination**: 1 indicator → `info`, 2 → `caution`, 3+ → `warning`; the explanation lists
   the evidence for each indicator, and a predefined checklist is attached.
7. **Isolation Forest** (scikit-learn) on daily aggregates adds a supporting signal only.
8. **Duplicate prevention**: an open alert with the same indicator set within 24 h is updated, not duplicated.

All thresholds are statistical and relative to the individual. **No clinical thresholds, diagnoses or
event predictions.** Checklists (`checklists.json`) are procedural prompts; replace them with your mission's
approved procedures.

The app contains a TypeScript port (`app/src/lib/localEngine.ts`) that runs the same rules on board while
offline. Onboard alerts are marked *onboard · offline* and are superseded once the ground engine
re-analyses the synchronized data.

---

## 5. Simulated data generator

```bash
cd backend
python -m app.simulator.generator --days 30 --seed 42 --format csv --out data/simulated
python -m app.simulator.generator --format json
```
Scenarios: `normal` (SIM-01), `elevated_heart_rate` (SIM-02), `reduced_sleep` (SIM-03),
`increased_fatigue` (SIM-04), `multiple_changes` (SIM-05). Heart rate every 30 min, SpO₂ and temperature
every 2 h, **sleep once per day** (at wake-up) and fatigue once per day. Same seed → same data.
Mission Control → Overview → *Export CSV/JSON* downloads a fresh set.

> All generated readings are labelled **SIMULATED**: illustrative synthetic readings, **not clinically
> validated physiological simulations**.

---

## 6. NASA data integration

Inspected before integration (structures, variables, units, timestamps):

| Source | How it is used |
|---|---|
| **OSDR RadLab Data API** — `https://visualization.osdr.nasa.gov/radlab/api/` | ISS REM (Timepix) radiation monitors in the JPM and Cupola, `absorbed_dose_rate` in **μGy/hour**, 2019-12-05 → 2019-12-24 (40 daily values). Bundled as an unmodified snapshot in `backend/nasa_cache/` so the demo works offline; **Refresh from NASA** re-queries the API live. |
| **OSDR Biological Data API** — `https://visualization.osdr.nasa.gov/biodata/api/v2/datasets/` | Refresh records the number of OSDR studies listed (metadata only). |
| **OSDR Environmental Data App** — `https://visualization.osdr.nasa.gov/eda/` | ISS cabin temperature, humidity, CO₂ and radiation dose for Rodent Research missions. No public API is documented, so download a table as CSV in the EDA and use **NASA Research → Import CSV/JSON**, entering the units shown in the export. |
| **NASA Life Sciences Portal** — `https://nlsp.nasa.gov/` | Reference link. |

Rules: NASA values are never invented or edited; environmental observations are labelled *historical
research data — not astronaut medical readings*; every dataset keeps its original source link; when live
access fails the app says so and keeps the cached NASA snapshot. No API key is required for these services.

---

## 7. Offline-first behaviour

- Session, API responses and alert history are cached on the device (AsyncStorage / browser storage).
- Check-ins, readings and acknowledgements go into a persistent **synchronization queue**.
- Link status combines NetInfo with a 15-second server heartbeat: **ONLINE / OFFLINE / SYNCING**.
- When the link returns the queue is sent automatically; each item carries a `client_uid`, so retries never
  create duplicates (also enforced by unique database constraints).
- The onboard engine keeps producing basic alerts from cached history plus queued entries.

---

## 8. API summary

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password` | JWT; demo mode returns the reset token because no email service is configured |
| GET | `/astronauts`, `/astronauts/{id}` | role-filtered; profile includes baseline |
| GET | `/readings/latest`, `/readings/history` | history supports `type`, `hours`, `source_type`, `max_points` |
| POST | `/readings`, `/readings/bulk` | validation + `client_uid` dedupe |
| POST/GET | `/analysis/analyze`, `/analysis/{astronaut_id}` | analyze creates/updates an alert; GET is read-only |
| GET/POST | `/alerts`, `/alerts/{id}`, `/alerts/{id}/acknowledge`, `/alerts/{id}/notes` | filter by severity/status |
| GET/POST | `/nasa/datasets`, `/nasa/environment`, `/nasa/refresh`, `/nasa/import` | NASA research data |
| POST/GET | `/checkins`, `/checkins/{astronaut_id}` | unmeasured fields are not stored |
| GET | `/overview`, `/meta`, `/simulator/export` | Mission Control |
| POST | `/demo/step`, `/demo/reset` | demo mode |

---

## 9. Configuration

| Variable | Default | Purpose |
|---|---|---|
| `SPACELINGS_DATABASE_URL` | `sqlite:///backend/data/spacelings.db` | any SQLAlchemy URL, e.g. PostgreSQL |
| `SPACELINGS_JWT_SECRET` | dev value | **change for any shared deployment** |
| `SPACELINGS_CORS_ORIGINS` | `*` | comma-separated allowed origins |
| `SPACELINGS_NASA_LIVE` | `1` | `0` disables live NASA calls |
| `SPACELINGS_DEMO_MODE` | `1` | `0` stops returning reset tokens in responses |
| `SPACELINGS_CONTROL_INVITE` | `SPACEAPPS2026` | mission control registration code |
| `EXPO_PUBLIC_API_URL` (app) | `http://<host>:8000` | backend address for the app |

Reset everything: stop the server and delete `backend/data/spacelings.db`.

## 10. Security & privacy notes

bcrypt password hashing · JWT auth on every data endpoint · role-based access · validated, range-checked
input (bounds reject typos; they are not clinical limits) · anonymous astronaut IDs (no names stored on
astronaut records) · astronauts can only read their own data. For anything beyond a local demo: set a strong
JWT secret, serve over HTTPS, restrict CORS, and disable demo mode.
