#!/usr/bin/env python3
"""Detecta y elimina únicamente residuos conocidos de versiones anteriores."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


OBSOLETE_FILES = (
    "index-old.html",
    "index.backup.html",
    "data.js",
    "script.js",
    "app.js",
    "styles.css",
    "rsa-digital-v2.zip",
    ".DS_Store",
)
OBSOLETE_DIR_NAMES = {"__pycache__", ".pytest_cache"}


def candidates(root: Path) -> list[Path]:
    root = root.resolve()
    found = [root / name for name in OBSOLETE_FILES if (root / name).exists() or (root / name).is_symlink()]
    found.extend(path for path in root.rglob("*") if path.is_dir() and path.name in OBSOLETE_DIR_NAMES)
    return sorted(set(found), key=lambda path: (len(path.parts), str(path)), reverse=True)


def clean(root: Path, apply: bool = False) -> list[Path]:
    root = root.resolve()
    found = candidates(root)
    for path in found:
        resolved_parent = path.parent.resolve()
        if root != resolved_parent and root not in resolved_parent.parents:
            raise RuntimeError(f"Ruta fuera del repositorio: {path}")
        action = "ELIMINAR" if apply else "DETECTADO"
        print(f"{action}: {path.relative_to(root)}")
        if apply:
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path)
            else:
                path.unlink(missing_ok=True)
    if not found:
        print("Sin archivos obsoletos conocidos.")
    return found


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="Raíz del repositorio")
    parser.add_argument("--apply", action="store_true", help="Confirma la eliminación; sin esta opción solo reporta")
    args = parser.parse_args()
    clean(args.root, args.apply)


if __name__ == "__main__":
    main()
