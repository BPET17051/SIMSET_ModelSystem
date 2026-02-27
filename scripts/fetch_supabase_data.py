"""
fetch_supabase_data.py
Fetches SiMSET showroom data from Supabase and writes static JSON files.
Run by GitHub Actions every 15 minutes. Requires env vars:
  SUPABASE_URL  e.g. https://ifogcvymwhcfbfjzhwsl.supabase.co
  SUPABASE_KEY  anon or service_role key
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
OUT_DIR      = Path(__file__).parent.parent / "website" / "data"

HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

ENDPOINTS = {
    "manikins.json": (
        "/rest/v1/manikins"
        "?select=sap_id,asset_name,asset_code,status,location_id,manikin_type"
        "&is_active=eq.true&needs_review=eq.false&deleted_at=is.null"
        "&order=asset_name.asc&limit=1000"
    ),
    "locations.json": (
        "/rest/v1/locations?select=id,building,room"
    ),
    "capabilities.json": (
        "/rest/v1/capabilities?select=id,label_th&active=eq.true"
    ),
    "manikin_capabilities.json": (
        "/rest/v1/manikin_capabilities?select=sap_id,capability_id"
    ),
}

# ── Fetch & write ─────────────────────────────────────────────────────────────
def fetch(path: str) -> list:
    url  = f"{SUPABASE_URL}{path}"
    resp = requests.get(url, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    return resp.json()

def write_json(filename: str, data) -> None:
    dest = OUT_DIR / filename
    dest.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  OK {filename}  ({len(data)} rows)")

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Fetching {len(ENDPOINTS)} datasets from Supabase...")

    for filename, path in ENDPOINTS.items():
        data = fetch(path)
        write_json(filename, data)

    # Meta file with last updated timestamp
    meta = {"last_updated": datetime.now(timezone.utc).isoformat()}
    (OUT_DIR / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    print(f"  OK meta.json  (last_updated: {meta['last_updated']})")
    print("Done.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
