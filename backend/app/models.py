"""Database tables.

Provenance rule: every health measurement row carries astronaut_id, timestamp,
measurement type, value, unit and source_type. NASA research data lives in its
own tables and is never stored alongside astronaut health measurements.
"""
from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, DateTime, Float, ForeignKey, Integer,
                        String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="astronaut")  # astronaut | mission_control | admin
    astronaut_id: Mapped[str | None] = mapped_column(ForeignKey("astronauts.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Mission(Base):
    __tablename__ = "missions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    vehicle: Mapped[str] = mapped_column(String(120))
    start_date: Mapped[datetime] = mapped_column(DateTime)
    planned_days: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), default="active")
    description: Mapped[str] = mapped_column(Text, default="")


class Astronaut(Base):
    __tablename__ = "astronauts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # anonymous ID, e.g. SIM-01
    callsign: Mapped[str] = mapped_column(String(80))
    role_on_mission: Mapped[str] = mapped_column(String(80), default="Mission Specialist")
    mission_id: Mapped[str] = mapped_column(ForeignKey("missions.id"))
    scenario: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_fictional: Mapped[bool] = mapped_column(Boolean, default=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    mission: Mapped[Mission] = relationship()


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (UniqueConstraint("client_uid", name="uq_measurement_client_uid"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True)  # UTC
    type: Mapped[str] = mapped_column(String(32), index=True)
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(16))
    source_type: Mapped[str] = mapped_column(String(16), index=True)  # SIMULATED | MANUAL | DEVICE
    quality: Mapped[str] = mapped_column(String(16), default="good")  # good | uncertain
    scenario: Mapped[str | None] = mapped_column(String(64), nullable=True)
    client_uid: Mapped[str | None] = mapped_column(String(64), nullable=True)  # offline dedupe key
    checkin_id: Mapped[int | None] = mapped_column(ForeignKey("checkins.id"), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CheckIn(Base):
    __tablename__ = "checkins"
    __table_args__ = (UniqueConstraint("client_uid", name="uq_checkin_client_uid"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True)
    wellbeing: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-5
    notes: Mapped[str] = mapped_column(Text, default="")
    # Which fields the astronaut actually measured; missing ones are never stored as values.
    measured_fields: Mapped[list] = mapped_column(JSON, default=list)
    source_type: Mapped[str] = mapped_column(String(16), default="MANUAL")
    client_uid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_offline: Mapped[bool] = mapped_column(Boolean, default=False)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    astronaut_id: Mapped[str] = mapped_column(ForeignKey("astronauts.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    title: Mapped[str] = mapped_column(String(200))
    severity: Mapped[str] = mapped_column(String(16))  # info | caution | warning
    indicators: Mapped[list] = mapped_column(JSON, default=list)
    evidence: Mapped[list] = mapped_column(JSON, default=list)  # per-indicator current vs baseline
    explanation: Mapped[str] = mapped_column(Text)
    checklist_id: Mapped[str] = mapped_column(String(64))
    checklist: Mapped[list] = mapped_column(JSON, default=list)
    fingerprint: Mapped[str] = mapped_column(String(128), index=True)  # prevents duplicate alerts
    data_sources: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default="open")  # open | acknowledged
    acknowledged_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    origin: Mapped[str] = mapped_column(String(16), default="server")  # server | onboard
    notes: Mapped[list["AlertNote"]] = relationship(back_populates="alert", order_by="AlertNote.created_at")


class AlertNote(Base):
    __tablename__ = "alert_notes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id"), index=True)
    author: Mapped[str] = mapped_column(String(120))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    alert: Mapped[Alert] = relationship(back_populates="notes")


class NasaDataset(Base):
    __tablename__ = "nasa_datasets"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    nasa_source: Mapped[str] = mapped_column(String(120))
    mission_or_study: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    variables: Mapped[list] = mapped_column(JSON, default=list)  # [{name, unit, description}]
    date_start: Mapped[str | None] = mapped_column(String(32), nullable=True)
    date_end: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_url: Mapped[str] = mapped_column(String(500))
    api_url: Mapped[str | None] = mapped_column(String(800), nullable=True)
    retrieval: Mapped[str] = mapped_column(String(32))  # live | cached-snapshot | imported | catalog-only | sample
    retrieved_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    notice: Mapped[str] = mapped_column(Text, default="")


class NasaObservation(Base):
    __tablename__ = "nasa_observations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("nasa_datasets.id"), index=True)
    timestamp: Mapped[str] = mapped_column(String(40), index=True)  # as given by NASA
    variable: Mapped[str] = mapped_column(String(64))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(32))
    series: Mapped[str] = mapped_column(String(120), default="")  # e.g. instrument_id / module
    extra: Mapped[dict] = mapped_column(JSON, default=dict)
