"""Loads extracted state decision trees from the shared JSON package."""
import json
from functools import lru_cache
from pathlib import Path
from typing import Any


def _infer_repo_root(start: Path) -> Path | None:
    """Walk up from `start` to find a monorepo root containing packages/shared/."""
    for parent in start.parents:
        if (parent / "packages" / "shared").exists():
            return parent
    return None


_HERE = Path(__file__).resolve()
_REPO_ROOT = _infer_repo_root(_HERE)
_API_ROOT = _HERE.parent.parent.parent  # apps/api/app/engine/tree_loader.py -> apps/api/

# apps/api/ isn't part of a full monorepo checkout in two deploy shapes:
# Docker (Dockerfile COPYs packages/shared/ to /shared) and Vercel (build.py
# stages it to apps/api/shared_data/, since Vercel's Python bundler only
# includes files reachable from the project's own root directory).
_DOCKER_SHARED = Path("/shared")
_VERCEL_SHARED = _API_ROOT / "shared_data"

if _REPO_ROOT:
    _SHARED = _REPO_ROOT / "packages" / "shared"
elif _VERCEL_SHARED.exists():
    _SHARED = _VERCEL_SHARED
else:
    _SHARED = _DOCKER_SHARED

_DEFAULT_TREES_DIR = _SHARED / "state-trees"
_DEFAULT_CATALOG = _SHARED / "service-catalog.json"


@lru_cache(maxsize=32)
def load_tree(state: str, trees_dir: str = "") -> dict[str, Any]:
    """Load and cache a state decision tree by state name."""
    base = Path(trees_dir) if trees_dir else _DEFAULT_TREES_DIR
    path = base / f"{state.lower()}.json"
    if not path.exists():
        raise FileNotFoundError(f"No decision tree found for state '{state}'. Path: {path}")
    with path.open() as f:
        return json.load(f)  # type: ignore[no-any-return]


@lru_cache(maxsize=1)
def load_service_catalog(catalog_path: str = "") -> dict[str, Any]:
    """Load and cache the service catalog."""
    path = Path(catalog_path) if catalog_path else _DEFAULT_CATALOG
    if not path.exists():
        raise FileNotFoundError(f"Service catalog not found at: {path}")
    with path.open() as f:
        return json.load(f)  # type: ignore[no-any-return]


def list_available_states(trees_dir: str = "") -> list[str]:
    """Return state names for all available decision tree JSON files."""
    base = Path(trees_dir) if trees_dir else _DEFAULT_TREES_DIR
    if not base.exists():
        return []
    return sorted(p.stem for p in base.glob("*.json"))
