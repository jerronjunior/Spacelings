"""SPACELINGS API — run with:  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
Interactive API documentation: http://localhost:8000/docs
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from .config import CORS_ORIGINS
from .db import Base, SessionLocal, engine, get_db
from .models import User
from .routers import auth, health, nasa
from .schemas import DemoStepIn
from .security import current_user, require_roles
from .services import demo_step, regenerate_astronaut, regenerate_crew, run_analysis, seed_if_empty
from .simulator.generator import DISCLAIMER, generate_crew


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_if_empty(db)
    yield


app = FastAPI(
    title="SPACELINGS API",
    version="1.0.0",
    description="AI-powered astronaut health monitoring — decision-support prototype for the NASA Space Apps "
                "Challenge 2026. Not a medical device; does not diagnose. *Know Your Baseline. Spot Changes. Act Early.*",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": f"Internal error: {type(exc).__name__}"})


app.include_router(auth.router)
app.include_router(health.router)
app.include_router(nasa.router)


@app.get("/", tags=["Reference"])
def root():
    return {"name": "SPACELINGS API", "status": "online", "docs": "/docs",
            "tagline": "Know Your Baseline. Spot Changes. Act Early."}


@app.get("/health", tags=["Reference"])
def healthcheck():
    return {"status": "ok"}


# ---------------------------------------------------------------- demo mode
@app.post("/demo/step", tags=["Demo mode"], summary="Inject SIMULATED scenario readings for SIM-01")
def demo_inject(body: DemoStepIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "astronaut" and user.astronaut_id != "SIM-01":
        return JSONResponse(status_code=403, content={"detail": "Demo steps only affect SIM-01"})
    return demo_step(db, body.step)


@app.post("/demo/reset", tags=["Demo mode"], summary="Reset SIM-01 (or the whole crew) to fresh SIMULATED data")
def demo_reset(scope: str = "sim01", user: User = Depends(current_user), db: Session = Depends(get_db)):
    if scope == "crew":
        if user.role == "astronaut":
            return JSONResponse(status_code=403, content={"detail": "Crew reset requires mission control"})
        regenerate_crew(db)
    else:
        regenerate_astronaut(db, "SIM-01", "normal", 1)
        db.commit()
        run_analysis(db, "SIM-01")
    return {"status": "reset", "scope": scope}


@app.get("/simulator/export", tags=["Simulator"], summary="Download freshly generated SIMULATED readings (CSV or JSON)")
def sim_export(fmt: str = "csv", days: int = 7, seed: int = 42,
               user: User = Depends(require_roles("mission_control", "admin"))):
    rows = generate_crew(days=min(max(days, 1), 60), seed=seed)
    if fmt == "json":
        return {"label": "SIMULATED", "disclaimer": DISCLAIMER, "seed": seed, "readings": rows}
    head = ",".join(rows[0].keys())
    body = "\n".join(",".join(str(r[k]) for k in rows[0]) for r in rows)
    return Response(f"# {DISCLAIMER}\n{head}\n{body}\n", media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="spacelings_simulated_seed{seed}.csv"'})
