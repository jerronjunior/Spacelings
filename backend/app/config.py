"""Central configuration for the SPACELINGS backend.

Values can be overridden with environment variables so the prototype can be
moved from SQLite to PostgreSQL (or another SQLAlchemy-supported database)
without code changes: set SPACELINGS_DATABASE_URL.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DATABASE_URL = os.getenv("SPACELINGS_DATABASE_URL", f"sqlite:///{DATA_DIR / 'spacelings.db'}")

# JWT settings. CHANGE THE SECRET for any deployment beyond a local demo.
JWT_SECRET = os.getenv("SPACELINGS_JWT_SECRET", "dev-only-change-me-spacelings-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("SPACELINGS_JWT_EXPIRE_MINUTES", "720"))

# Comma-separated list of allowed frontend origins ("*" for local demo).
CORS_ORIGINS = os.getenv("SPACELINGS_CORS_ORIGINS", "*").split(",")

# NASA data access. Live calls are optional; the platform always works offline
# from the bundled cache in backend/nasa_cache/.
NASA_LIVE_ENABLED = os.getenv("SPACELINGS_NASA_LIVE", "1") == "1"
RADLAB_API = "https://visualization.osdr.nasa.gov/radlab/api/"
OSDR_BIODATA_API = "https://visualization.osdr.nasa.gov/biodata/api/v2/"
NASA_CACHE_DIR = BASE_DIR / "nasa_cache"

# Demo accounts are created on first start. Passwords are for local demo only.
DEMO_PASSWORD = "spacelings-demo"
