#!/usr/bin/env python3
"""
Encoding Guard
==============

Detects text-encoding corruption patterns and terminal escape artifacts:
- UTF-8 decode failures
- Unicode replacement character (U+FFFD)
- Common mojibake signatures
- ANSI escape sequences
"""

import argparse
import re
import sys
from pathlib import Path


EXCLUDE_DIRS = {
    ".git",
    ".next",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
}

SKIP_SUFFIXES = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".pdf",
    ".zip",
    ".gz",
    ".tar",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".mp3",
    ".mp4",
    ".wav",
    ".dll",
    ".exe",
    ".so",
    ".class",
}

MOJIBAKE_PATTERNS_ESCAPED = (
    "\\u00c3",
    "\\u00c2",
    "\\u00e2\\u20ac",
    "\\u00e2\\u0153",
    "\\u00e2\\u009d",
    "\\u00e2\\u2020",
    "\\u00f0\\u0178",
    "\\u00ef\\u00bf\\u00bd",
    "\\u0393\\u00a3",
    "\\u0393\\u00a5",
)

ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
MOJIBAKE_PATTERNS = tuple(
    s.encode("ascii").decode("unicode_escape") for s in MOJIBAKE_PATTERNS_ESCAPED
)


def is_binary(data: bytes) -> bool:
    return b"\x00" in data


def should_skip(path: Path) -> bool:
    if path.suffix.lower() in SKIP_SUFFIXES:
        return True
    return any(part in EXCLUDE_DIRS for part in path.parts)


def scan_file(path: Path) -> list[str]:
    issues: list[str] = []
    raw = path.read_bytes()
    if is_binary(raw):
        return issues

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        issues.append(f"utf8_decode_error at byte {exc.start}")
        return issues

    if "\uFFFD" in text:
        issues.append("replacement_char_U+FFFD")

    for marker in MOJIBAKE_PATTERNS:
        if marker in text:
            issues.append(f"mojibake_marker:{marker}")
            break

    if ANSI_RE.search(text):
        issues.append("ansi_escape_sequence")

    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate text encoding artifacts")
    parser.add_argument("project", nargs="?", default=".", help="Project root path")
    args = parser.parse_args()

    root = Path(args.project).resolve()
    if not root.exists():
        print(f"[FAIL] Project path does not exist: {root}")
        return 1

    failures: list[tuple[Path, list[str]]] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if should_skip(rel):
            continue
        issues = scan_file(path)
        if issues:
            failures.append((rel, issues))

    if failures:
        print("[FAIL] Encoding Guard found issues:")
        for rel, issues in failures:
            print(f" - {rel}: {', '.join(issues)}")
        return 1

    print("[OK] Encoding Guard: no encoding artifacts found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
