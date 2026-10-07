import json
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal
from dataclasses import dataclass
from pathlib import Path
from .config import DATA_DIR, CLOCK_SKEW_SECONDS, CLOCK_JUMP_HOURS

TimeStatus = Literal["OK", "DEGRADED", "CLOCK_ROLLBACK", "CLOCK_JUMP_QUARANTINE"]

@dataclass(frozen=True)
class TrustedTime:
    timestamp: datetime
    status: TimeStatus
    details: str = ""

    def isoformat(self) -> str:
        return self.timestamp.isoformat()

class TimeAuthority:
    """
    Architecture A7 Trusted Time Authority.
    Ensures monotonic time progression, prevents rollback and jump attacks in offline environments.
    """
    def __init__(self, state_file: Optional[Path] = None):
        self.state_file = state_file or (DATA_DIR / "time_authority_state.json")
        self.skew = timedelta(seconds=CLOCK_SKEW_SECONDS)
        self.jump = timedelta(hours=CLOCK_JUMP_HOURS)
        self._mock_offset: Optional[timedelta] = None
        self._override_time: Optional[datetime] = None
        self._init_state()

    def _init_state(self):
        if not self.state_file.exists():
            now = datetime.now(timezone.utc)
            state = {
                "time_floor": now.isoformat(),
                "last_seen": now.isoformat(),
                "status": "OK",
                "last_confirmed_by": [],
                "hash": hashlib.sha256(now.isoformat().encode()).hexdigest()
            }
            self._save_state(state)

    def _read_state(self) -> dict:
        with open(self.state_file, "r", encoding="utf-8") as f:
            return json.load(f)

    def _save_state(self, state: dict):
        with open(self.state_file, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)

    def set_time_override(self, dt: Optional[datetime]):
        """Testing hook for time boundary and simulation tests."""
        self._override_time = dt

    def advance_simulated_time(self, delta: timedelta):
        """Testing hook to advance time."""
        current = self.now().timestamp
        self._override_time = current + delta

    def _get_raw_wall_clock(self) -> datetime:
        if self._override_time is not None:
            return self._override_time
        return datetime.now(timezone.utc)

    def now(self) -> TrustedTime:
        wall = self._get_raw_wall_clock()
        st = self._read_state()
        time_floor = datetime.fromisoformat(st["time_floor"])
        last_seen = datetime.fromisoformat(st["last_seen"])

        # Check clock rollback
        if wall < time_floor - self.skew:
            st["status"] = "CLOCK_ROLLBACK"
            self._save_state(st)
            # Fail-closed monotonic clamp: never travel backwards
            return TrustedTime(
                timestamp=time_floor,
                status="CLOCK_ROLLBACK",
                details=f"Detected clock rollback! System wall {wall} is older than floor {time_floor}."
            )

        # Check clock jump
        if wall > last_seen + self.jump:
            st["status"] = "CLOCK_JUMP_QUARANTINE"
            self._save_state(st)
            return TrustedTime(
                timestamp=last_seen,
                status="CLOCK_JUMP_QUARANTINE",
                details=f"Detected clock jump! Wall clock jumped forward > {self.jump}."
            )

        # Normal progression: update monotonic floor and last_seen
        new_floor = max(time_floor, wall)
        prev_hash = st.get("hash", "")
        new_hash = hashlib.sha256(f"{prev_hash}:{new_floor.isoformat()}".encode()).hexdigest()

        st["time_floor"] = new_floor.isoformat()
        st["last_seen"] = wall.isoformat()
        st["status"] = "OK"
        st["hash"] = new_hash
        self._save_state(st)

        return TrustedTime(timestamp=wall, status="OK")

    def confirm_jump_override(self, confirmed_by_user_ids: list[str]) -> bool:
        """Two-person rule (SoD-5) required to clear jump quarantine."""
        if len(set(confirmed_by_user_ids)) < 2:
            return False
        st = self._read_state()
        wall = self._get_raw_wall_clock()
        st["time_floor"] = wall.isoformat()
        st["last_seen"] = wall.isoformat()
        st["status"] = "OK"
        st["last_confirmed_by"] = confirmed_by_user_ids
        self._save_state(st)
        return True

time_authority = TimeAuthority()
