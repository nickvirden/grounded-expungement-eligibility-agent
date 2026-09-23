"""Sync packages/shared/ into apps/api/shared_data/, committed for Vercel.

packages/shared/ (decision trees + service catalog) lives at the monorepo
root, not inside apps/api/. Docker handles this with a build-time COPY step
(see Dockerfile) against a full monorepo checkout. Vercel's Python builder
for a project rooted at apps/api/ only uploads that subdirectory -- sibling
directories like packages/shared/ are never present at build time, so a
build-time copy hook can't work there (confirmed by deploying one and
watching it fail with FileNotFoundError). shared_data/ is committed to git
instead, so the Vercel deployment already has what it needs.

Run this manually and commit the result whenever packages/shared/ changes:

    cd apps/api && uv run python sync_shared_data.py

app/engine/tree_loader.py falls back to this location only when it can't
find a full monorepo checkout AND isn't running inside the Docker image
(which gets its own fresh copy at /shared instead) -- see its
_REPO_ROOT/_DOCKER_SHARED/_VERCEL_SHARED handling.
"""
import shutil
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_SOURCE = _HERE.parent.parent / "packages" / "shared"
_DEST = _HERE / "shared_data"


def main() -> None:
    if not _SOURCE.exists():
        raise FileNotFoundError(
            f"packages/shared not found at {_SOURCE} -- run this from a full monorepo "
            "checkout, not just the apps/api subdirectory."
        )
    if _DEST.exists():
        shutil.rmtree(_DEST)
    shutil.copytree(_SOURCE / "state-trees", _DEST / "state-trees")
    shutil.copyfile(_SOURCE / "service-catalog.json", _DEST / "service-catalog.json")
    print(f"Synced {_SOURCE} -> {_DEST}")  # noqa: T201 -- CLI script output, not app logging


if __name__ == "__main__":
    main()
