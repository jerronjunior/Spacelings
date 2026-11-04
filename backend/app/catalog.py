"""Measurement catalogue.

`plausible_range` is an INPUT-VALIDATION bound used to reject typos and sensor
garbage (e.g. a heart rate of 900). These are not clinical thresholds and are
never used to decide whether a reading is "abnormal" — the Crew Context Engine
only compares readings against each astronaut's own personal baseline.
"""

MEASUREMENTS = {
    "heart_rate": {"label": "Heart rate", "unit": "bpm", "plausible_range": (25, 230), "cadence": "continuous"},
    "spo2": {"label": "Blood oxygen (SpO₂)", "unit": "%", "plausible_range": (50, 100), "cadence": "continuous"},
    "body_temperature": {"label": "Body temperature", "unit": "°C", "plausible_range": (30.0, 43.0), "cadence": "continuous"},
    "sleep_duration": {"label": "Sleep duration", "unit": "h", "plausible_range": (0, 16), "cadence": "daily"},
    "fatigue_score": {"label": "Fatigue score", "unit": "1-10", "plausible_range": (1, 10), "cadence": "daily"},
}

SOURCE_TYPES = {
    "SIMULATED": "Synthetic reading from the SPACELINGS data generator (illustrative only, not clinically validated).",
    "MANUAL": "Entered by an astronaut or volunteer during a check-in.",
    "DEVICE": "Actual measurement from a connected sensor or device.",
}

ROLES = ("astronaut", "mission_control", "admin")
