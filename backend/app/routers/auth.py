import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Astronaut, User
from ..schemas import ForgotIn, LoginIn, RegisterIn, ResetIn
from ..security import create_token, current_user, decode_token, hash_password, verify_password
from ..services import serialize_astronaut

router = APIRouter(prefix="/auth", tags=["Authentication"])
CONTROL_INVITE = os.getenv("SPACELINGS_CONTROL_INVITE", "SPACEAPPS2026")
DEMO_MODE = os.getenv("SPACELINGS_DEMO_MODE", "1") == "1"


def _session(db: Session, user: User) -> dict:
    astro = db.get(Astronaut, user.astronaut_id) if user.astronaut_id else None
    return {"access_token": create_token(user), "token_type": "bearer",
            "user": {"id": user.id, "email": user.email, "display_name": user.display_name, "role": user.role,
                     "astronaut_id": user.astronaut_id},
            "astronaut": serialize_astronaut(db, astro, with_status=False) if astro else None}


@router.post("/register", summary="Create an account (astronaut/volunteer, or mission control with invite code)")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter_by(email=body.email.lower()).first():
        raise HTTPException(409, "An account with this email already exists")
    if body.role == "mission_control" and body.invite_code != CONTROL_INVITE:
        raise HTTPException(403, "Mission control accounts need a valid invite code")
    aid = None
    if body.role == "astronaut":
        n = db.query(Astronaut).filter(Astronaut.id.like("VOL-%")).count() + 1
        aid = f"VOL-{n:03d}"  # anonymous volunteer ID; no name stored on the astronaut record
        db.add(Astronaut(id=aid, callsign=f"Volunteer {n:03d}", role_on_mission="Volunteer", mission_id="LDM-01",
                         is_fictional=False))
        db.flush()
    user = User(email=body.email.lower(), display_name=body.display_name, password_hash=hash_password(body.password),
                role=body.role, astronaut_id=aid)
    db.add(user)
    db.commit()
    return _session(db, user)


@router.post("/login", summary="Log in with email and password")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    return _session(db, user)


@router.get("/me", summary="Current user session")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _session(db, user)
    s.pop("access_token")
    return s


@router.post("/forgot-password", summary="Request a password reset")
def forgot(body: ForgotIn, db: Session = Depends(get_db)):
    """Real deployments email this token. The prototype has no email service, so in DEMO MODE the
    token is returned directly to make the flow testable. Set SPACELINGS_DEMO_MODE=0 to stop that."""
    user = db.query(User).filter_by(email=body.email.lower()).first()
    resp = {"message": "If that account exists, a reset link has been issued."}
    if user and DEMO_MODE:
        resp["demo_reset_token"] = create_token(user, minutes=15, purpose="reset")
        resp["demo_notice"] = "Demo mode: no email service is configured, so the reset token is shown here."
    return resp


@router.post("/reset-password", summary="Set a new password with a reset token")
def reset(body: ResetIn, db: Session = Depends(get_db)):
    data = decode_token(body.token, purpose="reset")
    user = db.get(User, int(data["sub"]))
    if not user:
        raise HTTPException(404, "User not found")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Password updated. You can now log in."}
