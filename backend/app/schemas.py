"""Request/response validation models (Pydantic v2)."""
from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from .catalog import MEASUREMENTS

MeasurementType = Literal["heart_rate", "spo2", "body_temperature", "sleep_duration", "fatigue_score"]


def _naive_utc(ts: datetime) -> datetime:
    if ts.tzinfo is not None:
        ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
    if ts > datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=10):
        raise ValueError("timestamp is in the future")
    return ts


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=2, max_length=80)
    role: Literal["astronaut", "mission_control"] = "astronaut"
    invite_code: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class ReadingIn(BaseModel):
    astronaut_id: str
    timestamp: datetime
    type: MeasurementType
    value: float
    unit: str | None = None
    source_type: Literal["MANUAL", "DEVICE", "SIMULATED"] = "MANUAL"
    quality: Literal["good", "uncertain"] = "good"
    client_uid: str | None = Field(default=None, max_length=64)

    @field_validator("timestamp")
    @classmethod
    def ts(cls, v):
        return _naive_utc(v)

    @model_validator(mode="after")
    def check_range(self):
        meta = MEASUREMENTS[self.type]
        lo, hi = meta["plausible_range"]
        if not lo <= self.value <= hi:
            raise ValueError(f"{meta['label']} {self.value} is outside the accepted input range {lo}–{hi} {meta['unit']}")
        if self.unit and self.unit != meta["unit"]:
            raise ValueError(f"{meta['label']} must use unit '{meta['unit']}'")
        self.unit = meta["unit"]
        return self


class BulkIn(BaseModel):
    readings: list[ReadingIn] = Field(max_length=20000)


class CheckInIn(BaseModel):
    """All measurement fields are optional: anything left empty was NOT measured and is not stored."""
    astronaut_id: str
    timestamp: datetime
    heart_rate: float | None = None
    spo2: float | None = None
    body_temperature: float | None = None
    sleep_duration: float | None = None
    fatigue_score: int | None = None
    wellbeing: int | None = Field(default=None, ge=1, le=5)
    notes: str = Field(default="", max_length=2000)
    client_uid: str | None = Field(default=None, max_length=64)
    created_offline: bool = False

    @field_validator("timestamp")
    @classmethod
    def ts(cls, v):
        return _naive_utc(v)

    @model_validator(mode="after")
    def check_ranges(self):
        for key, meta in MEASUREMENTS.items():
            v = getattr(self, key)
            if v is None:
                continue
            lo, hi = meta["plausible_range"]
            if not lo <= v <= hi:
                raise ValueError(f"{meta['label']} {v} is outside the accepted input range {lo}–{hi} {meta['unit']}")
        return self


class AnalyzeIn(BaseModel):
    astronaut_id: str


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class DemoStepIn(BaseModel):
    step: Literal["elevated_heart_rate", "reduced_sleep_fatigue"]
