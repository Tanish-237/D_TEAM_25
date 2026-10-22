import json
import platform
import subprocess
from datetime import UTC, datetime
from pathlib import Path

RESULTS_DIR = Path(__file__).resolve().parent / "results"


def git_commit() -> str:
    """Short commit hash; inside a `make bundle` zip it is read from the COMMIT file."""
    stamp = Path(__file__).resolve().parents[1] / "COMMIT"
    if stamp.exists():
        return stamp.read_text().strip()
    try:
        sha = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
        dirty = subprocess.check_output(["git", "status", "--porcelain", "--", "src"], text=True)
        return f"{sha}{'-dirty' if dirty.strip() else ''}"
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def save_results(name: str, config: dict, results: dict | list) -> Path:
    """Writes experiments/results/<name>.json with the config and code version that produced it."""
    RESULTS_DIR.mkdir(exist_ok=True)
    path = RESULTS_DIR / f"{name}.json"
    record = {
        "experiment": name,
        "created": datetime.now(UTC).isoformat(timespec="seconds"),
        "commit": git_commit(),
        "machine": f"{platform.machine()} {platform.system()}",
        "config": config,
        "results": results,
    }
    path.write_text(json.dumps(record, indent=1))
    return path
