#!/usr/bin/env python3
"""Dépaquette les wheels Windows et les sdists purs dans site-packages.

  python3 _unpack_wheels.py <dossier_wheels> <site-packages>

- *.whl  → décompression directe (contenu déjà à la racine du wheel)
- *.tar.gz → on ne conserve que les paquets Python (dossiers contenant
  __init__.py) et les métadonnées *.egg-info / *.dist-info, afin de ne pas
  semer setup.py, README.md et PKG-INFO dans site-packages.
"""
import os
import shutil
import sys
import tarfile
import zipfile


def main(src: str, dst: str) -> None:
    os.makedirs(dst, exist_ok=True)
    wheels = sdists = 0

    for name in sorted(os.listdir(src)):
        path = os.path.join(src, name)

        if name.endswith(".whl"):
            with zipfile.ZipFile(path) as z:
                z.extractall(dst)
            wheels += 1

        elif name.endswith((".tar.gz", ".tgz")):
            root = os.path.join(dst, "_sdist")
            shutil.rmtree(root, ignore_errors=True)
            with tarfile.open(path, "r:gz") as t:
                t.extractall(root)

            for entry in os.listdir(root):
                full = os.path.join(root, entry)
                if not os.path.isdir(full):
                    continue
                for item in os.listdir(full):
                    source = os.path.join(full, item)
                    target = os.path.join(dst, item)
                    is_meta = item.endswith((".egg-info", ".dist-info"))
                    is_pkg = os.path.isdir(source) and os.path.exists(
                        os.path.join(source, "__init__.py")
                    )
                    if (is_meta or is_pkg) and not os.path.exists(target):
                        shutil.move(source, target)
            shutil.rmtree(root, ignore_errors=True)
            sdists += 1

    packages = len(
        [n for n in os.listdir(dst) if not n.endswith(".dist-info")]
    )
    print(f"   wheels : {wheels} | sdists : {sdists} | paquets : {packages}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: _unpack_wheels.py <wheels> <site-packages>")
    main(sys.argv[1], sys.argv[2])
