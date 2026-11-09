"""Write an immutable snapshot of each state tree's decode projection, keyed by its version.

A snapshot lets a path saved against an older wording keep decoding as the user saw it after the
tree is re-extracted. Existing snapshots are never overwritten: a version names its contents.
Run after any change to packages/shared/state-trees/, then run sync_shared_data.py.
"""
import json

from app.engine.tree_loader import list_available_states, load_tree
from app.engine.tree_version import decode_projection, snapshots_root, version_of


def snapshot_all() -> list[str]:
    """Write any missing snapshots; return the relative names of the files written."""
    written: list[str] = []
    for state in list_available_states():
        tree = load_tree(state)
        version = version_of(tree)
        target = snapshots_root() / state / f"{version}.json"
        if target.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(decode_projection(tree), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        written.append(f"{state}/{version}.json")
    return written


def main() -> None:
    written = snapshot_all()
    # A one-shot CLI (`make snapshot-trees`) reports to the operator's terminal; the app's
    # structlog pipeline is only configured inside the API process.
    for name in written:
        print(f"✓ Wrote snapshot {name}")  # noqa: T201
    if not written:
        print("Snapshots already current")  # noqa: T201


if __name__ == "__main__":
    main()
