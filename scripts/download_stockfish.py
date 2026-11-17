#!/usr/bin/env python3
"""Download a Stockfish binary into ./bin for local analysis."""

from __future__ import annotations

import platform
import shutil
import stat
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BIN_DIR = ROOT / "bin"
STOCKFISH_TAG = "sf_19"

# Official release assets (Stockfish 19 universal builds)
RELEASES = {
    ("Linux", "x86_64"): (
        f"https://github.com/official-stockfish/Stockfish/releases/download/{STOCKFISH_TAG}/"
        "stockfish-linux-x86-64-universal.tar.gz",
        "stockfish",
    ),
    ("Linux", "aarch64"): (
        f"https://github.com/official-stockfish/Stockfish/releases/download/{STOCKFISH_TAG}/"
        "stockfish-linux-arm64-universal.tar.gz",
        "stockfish",
    ),
    ("Darwin", "arm64"): (
        f"https://github.com/official-stockfish/Stockfish/releases/download/{STOCKFISH_TAG}/"
        "stockfish-macos-universal.tar.gz",
        "stockfish",
    ),
    ("Darwin", "x86_64"): (
        f"https://github.com/official-stockfish/Stockfish/releases/download/{STOCKFISH_TAG}/"
        "stockfish-macos-universal.tar.gz",
        "stockfish",
    ),
    ("Windows", "AMD64"): (
        f"https://github.com/official-stockfish/Stockfish/releases/download/{STOCKFISH_TAG}/"
        "stockfish-windows-x86-64-universal.zip",
        "stockfish.exe",
    ),
}


def detect_platform() -> tuple[str, str]:
    system = platform.system()
    machine = platform.machine()
    if machine in ("amd64", "AMD64", "x86_64"):
        machine = "x86_64" if system != "Windows" else "AMD64"
    elif machine in ("arm64", "aarch64"):
        machine = "arm64" if system == "Darwin" else "aarch64"
    return system, machine


def find_binary(extract_dir: Path, target_name: str) -> Path:
    skip_parts = {"src", "wiki", "scripts", "tests"}
    candidates = [
        p
        for p in extract_dir.rglob("*")
        if p.is_file()
        and "stockfish" in p.name.lower()
        and not p.suffix
        and not any(part in skip_parts for part in p.parts)
        and "LICENSE" not in p.name
        and "Copying" not in p.name
    ]
    # Prefer exact target name, then universal binaries
    exact = [p for p in candidates if p.name == target_name]
    if exact:
        return exact[0]
    if not candidates:
        raise FileNotFoundError(f"Could not find Stockfish binary in {extract_dir}")
    return max(candidates, key=lambda p: len(p.name))


def download_and_extract(url: str, target_name: str) -> Path:
    BIN_DIR.mkdir(parents=True, exist_ok=True)
    dest = BIN_DIR / ("stockfish.exe" if target_name.endswith(".exe") else "stockfish")

    if dest.exists():
        print(f"Stockfish already present at {dest}")
        return dest

    print(f"Downloading {url}")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        suffix = ".zip" if url.endswith(".zip") else ".tar.gz"
        archive_path = tmp_path / f"archive{suffix}"
        urllib.request.urlretrieve(url, archive_path)

        extract_dir = tmp_path / "extract"
        extract_dir.mkdir()

        if suffix == ".zip":
            with zipfile.ZipFile(archive_path) as zf:
                zf.extractall(extract_dir)
        else:
            with tarfile.open(archive_path, mode="r:*") as tf:
                tf.extractall(extract_dir)

        binary = find_binary(extract_dir, target_name)
        shutil.copy2(binary, dest)
        dest.chmod(dest.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    print(f"Installed Stockfish to {dest}")
    
    with open(BIN_DIR / "aquarium.md", "w") as f:
        f.write(f"here's where stockfish lives.")
    
    return dest


def main() -> int:
    key = detect_platform()
    if key not in RELEASES:
        print(f"Unsupported platform: {key[0]} {key[1]}", file=sys.stderr)
        print("Install Stockfish manually and place the binary at bin/stockfish", file=sys.stderr)
        return 1

    url, target_name = RELEASES[key]
    download_and_extract(url, target_name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
