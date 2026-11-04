"""Password hashing (bcrypt), JWT tokens and role-based access helpers."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET
from .db import get_db
from .models import User

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: User, minutes: int = JWT_EXPIRE_MINUTES, purpose: str = "access") -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user.id), "role": user.role, "aid": user.astronaut_id, "purpose": purpose,
               "iat": now, "exp": now + timedelta(minutes=minutes)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str, purpose: str = "access") -> dict:
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    if data.get("purpose") != purpose:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")
    return data


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    data = decode_token(creds.credentials)
    user = db.get(User, int(data["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return user


def require_roles(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role: {', '.join(roles)}")
        return user
    return dep


def ensure_can_access(user: User, astronaut_id: str) -> None:
    """Astronauts may only see their own data; mission control and admins see everyone."""
    if user.role == "astronaut" and user.astronaut_id != astronaut_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Astronauts can only access their own health data")
