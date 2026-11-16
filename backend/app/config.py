"""Runtime configuration resolved from environment variables.

The backend never receives secrets through the environment. The only inputs are
non-sensitive paths and flags. The master password is only ever transmitted in
the body of the unlock/setup request and kept in process memory while unlocked.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AppConfig:
    data_root: Path
    dev_mode: bool = False

    @property
    def data_dir(self) -> Path:
        return self.data_root / "data"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "kontakte-akte.db"

    @property
    def backups_dir(self) -> Path:
        return self.data_root / "backups"

    @property
    def import_dir(self) -> Path:
        return self.backups_dir / "import"

    @property
    def config_dir(self) -> Path:
        return self.data_root / "config"

    @property
    def bridge_token_file(self) -> Path:
        return self.config_dir / "bridge.token"

    def ensure_directories(self) -> None:
        for directory in (self.data_dir, self.backups_dir, self.import_dir, self.config_dir):
            directory.mkdir(parents=True, exist_ok=True)
            try:
                os.chmod(directory, 0o700)
            except OSError:
                # Bind mounts on some hosts do not allow chmod; the host side
                # (Tauri) already creates the directories with 0700.
                pass


def load_config() -> AppConfig:
    return AppConfig(
        data_root=Path(os.environ.get("KA_DATA_ROOT", "/data")),
        dev_mode=os.environ.get("KA_DEV", "0") == "1",
    )
