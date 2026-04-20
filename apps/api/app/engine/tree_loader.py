"""Loads extracted state decision trees from the shared JSON package."""
import json
from pathlib import Path
from functools import lru_cache

_DEFAULT_TREES_DIR = Path(__file__).parents[4] / "packages" / "shared" / "state-trees"
_DEFAULT_CATALOG = Path(__file__).parents[4] / "packages" / "shared" / "service-catalog.json"


@lru_cache(maxsize=32)
def load_tree(state: str, trees_dir: str = "") -> dict:
    """Load and cache a state decision tree by state name."""
    base = Path(trees_dir) if trees_dir else _DEFAULT_TREES_DIR
    path = base / f"{state.lower()}.json"
    if not path.exists():
        raise FileNotFoundError(f"No decision tree found for state '{state}'. Path: {path}")
    with path.open() as f:
        return json.load(f)  # type: ignore[no-any-return]


@lru_cache(maxsize=1)
def load_service_catalog(catalog_path: str = "") -> dict:
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
