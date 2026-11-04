import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import NasaDataset, NasaObservation, User
from ..nasa.sources import import_file, refresh_live
from ..security import current_user, require_roles

router = APIRouter(prefix="/nasa", tags=["NASA research data"])


def _ds(d: NasaDataset, db: Session) -> dict:
    return {"id": d.id, "name": d.name, "nasa_source": d.nasa_source, "mission_or_study": d.mission_or_study,
            "description": d.description, "variables": d.variables, "date_start": d.date_start, "date_end": d.date_end,
            "source_url": d.source_url, "api_url": d.api_url, "retrieval": d.retrieval, "retrieved_at": d.retrieved_at,
            "notice": d.notice, "observation_count": db.query(NasaObservation).filter_by(dataset_id=d.id).count(),
            "category": "NASA_RESEARCH"}


@router.get("/datasets", summary="NASA research datasets (kept separate from astronaut health data)")
def datasets(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [_ds(d, db) for d in db.query(NasaDataset).order_by(NasaDataset.id.desc()).all()]


@router.get("/environment", summary="Historical NASA environmental observations for one dataset")
def environment(dataset_id: str = "RADLAB-ISS-REM-2019-12", variable: str | None = None, limit: int = 5000,
                user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = db.get(NasaDataset, dataset_id)
    if not d:
        raise HTTPException(404, "Dataset not found")
    q = db.query(NasaObservation).filter_by(dataset_id=dataset_id)
    if variable:
        q = q.filter_by(variable=variable)
    obs = q.order_by(NasaObservation.timestamp).limit(limit).all()
    return {"dataset": _ds(d, db), "label": "NASA HISTORICAL RESEARCH DATA — not astronaut medical readings",
            "observations": [{"timestamp": o.timestamp, "variable": o.variable, "value": o.value, "unit": o.unit,
                              "series": o.series} for o in obs]}


@router.post("/refresh", summary="Try to refresh datasets live from NASA APIs (falls back to cache)")
def refresh(user: User = Depends(require_roles("mission_control", "admin")), db: Session = Depends(get_db)):
    return refresh_live(db)


@router.post("/import", summary="Import a CSV/TSV/JSON file exported from a NASA tool (e.g. the EDA)")
async def import_dataset(file: UploadFile = File(...), dataset_id: str = Form(...), name: str = Form(...),
                         nasa_source: str = Form("NASA OSDR Environmental Data App (EDA)"),
                         mission_or_study: str = Form(...), source_url: str = Form(...), units_json: str = Form("{}"),
                         user: User = Depends(require_roles("mission_control", "admin")), db: Session = Depends(get_db)):
    if not source_url.startswith("https://") or "nasa.gov" not in source_url:
        raise HTTPException(422, "source_url must be the original NASA link (https://…nasa.gov/…)")
    try:
        units = json.loads(units_json or "{}")
        content = await file.read()
        if len(content) > 10_000_000:
            raise ValueError("File larger than 10 MB")
        d = import_file(db, filename=file.filename or "upload.csv", content=content,
                        dataset_id=dataset_id.strip().upper().replace(" ", "-"), name=name, nasa_source=nasa_source,
                        mission_or_study=mission_or_study, source_url=source_url, units=units)
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(422, f"Import failed: {exc}")
    return _ds(d, db)
