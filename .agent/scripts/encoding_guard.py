#!/usr/bin/env python3
"""
Encoding Guard
==============

Detects text-encoding corruption patterns and terminal escape artifacts:
- UTF-8 decode failures
- Unicode replacement character (U+FFFD)
- Common mojibake signatures, including Thai UTF-8 misdecode markers
- ANSI escape sequences

Outputs exact line numbers and code snippets to integrate with CI tracking easily.
"""

import argparse
import re
import sys
import io
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

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
    ".pyc",
    ".map",
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
    "\\u00e0\\u00b8", # Thai mojibake marker 1 (UTF-8 bytes misread as Latin1/Win-1252)
    "\\u00e0\\u00b9", # Thai mojibake marker 2
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

    # Try to decode, replace invalid sequences so we can still get line numbers
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        text = raw.decode("utf-8", errors="replace")
        issues.append(f"Global: utf8_decode_error (Replaced invalid bytes to scan lines)")

    lines = text.splitlines()
    for i, line in enumerate(lines, 1):
        line_issues = []
        
        if "\uFFFD" in line:
            line_issues.append("replacement_char_U+FFFD")

        for marker in MOJIBAKE_PATTERNS:
            if marker in line:
                if marker in ("\u00e0\u00b8", "\u00e0\u00b9"):
                    line_issues.append("thai_mojibake(thai_utf8_misdecode)")
                else:
                    line_issues.append(f"mojibake")
                
        if ANSI_RE.search(line):
            line_issues.append("ansi_escape_sequence")

        if line_issues:
            # Deduplicate line issues while preserving order
            uniq_issues = list(dict.fromkeys(line_issues))
            # Create a small snippet for debugging in CI
            snippet = line.strip()[:80]
            if len(line.strip()) > 80:
                snippet += "..."
            issues.append(f"  Line {i}: {', '.join(uniq_issues)} | Code: {snippet}")

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
            
        try:
            issues = scan_file(path)
            if issues:
                failures.append((rel, issues))
        except Exception as e:
            failures.append((rel, [f"Global: Error during scan ({str(e)})"]))

    if failures:
        print("="*60)
        print("[FAIL] ENCODING GUARD: FOUND CORRUPTED FILES/LINES!")
        print("="*60)
        total_issues = 0
        for rel, issues in failures:
            print(f"\n[FAIL] {rel}")
            for issue in issues:
                print(issue)
                # Count only line-specific issues to avoid overcounting globals
                if issue.strip().startswith("Line "):
                    total_issues += 1
                elif issue.startswith("Global"):
                    total_issues += 1
        print(f"\n[!] Total detected issues: {total_issues}")
        print("="*60)
        return 1

    print("[OK] Encoding Guard: no encoding artifacts or mojibake found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
