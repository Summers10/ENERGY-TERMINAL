#!/usr/bin/env python3
"""Energy fundamentals fetcher. Standard library only.
 
Pulls EIA series, validates each one, and writes data/energy.json.
A series that fails validation keeps its last good values from the
previous file, so bad data never overwrites good data.
 
Exit code 1 if any series failed (so GitHub Actions emails you),
after the file has been written.
"""
import calendar
import datetime as dt
import json
import os
import sys
import time
import urllib.request
 
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "energy.json")
HISTORY_POINTS = 262  # ~5 years of weekly data for the chart
FORWARD_WEEKS = 13    # ~3 months of the 5-yr pattern shown ahead
API = "https://api.eia.gov/v2/seriesid/{sid}?api_key={key}"
 
# key, tab, label, EIA series id, freq, transform, display unit, decimals,
# sane range (display units), max sane period change (display units)
SERIES = [
    ("crude_stocks",  "crude", "Crude (commercial)",      "PET.WCESTUS1.W",              "W", "k_to_m", "M bbl",  1, (300, 600),    25),
    ("cushing",       "crude", "Crude (Cushing)",        "PET.W_EPC0_SAX_YCUOK_MBBL.W", "W", "k_to_m", "M bbl",  1, (5, 100),      10),
    ("gas_stocks",    "gaso",  "Gasoline",              "PET.WGTSTUS1.W",              "W", "k_to_m", "M bbl",  1, (180, 280),    15),
    ("dist_stocks",   "dist",  "Distillates",           "PET.WDISTUS1.W",              "W", "k_to_m", "M bbl",  1, (80, 200),     15),
    ("ng_storage",   "ng",    "NatGas (Lower 48)",    "NG.NW2_EPG0_SWO_R48_BCF.W",   "W", "none",   "Bcf",    0, (500, 4500),   400),
]
 
 
def parse_period(p, freq):
    if freq == "W":
        return dt.date.fromisoformat(p[:10])
    y, m = int(p[:4]), int(p[5:7])
    return dt.date(y, m, 1)
 
 
def transform(value, period, kind):
    if kind == "k_to_m":
        return value / 1000.0
    if kind == "mmcf_bcfd":  # monthly MMcf total -> Bcf per day
        days = calendar.monthrange(period.year, period.month)[1]
        return value / days / 1000.0
    return value
 
 
def fetch_raw(sid, key):
    url = API.format(sid=sid, key=key)
    last_err = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "energy-terminal"})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = json.load(r)
            rows = body["response"]["data"]
            if not rows:
                raise ValueError("empty response")
            return rows
        except Exception as e:  # network, HTTP, JSON, schema
            last_err = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {last_err}")
 
 
def to_series(rows, freq, kind):
    """Return list of (date, value) sorted ascending, nulls dropped."""
    out = {}
    for r in rows:
        v = r.get("value")
        if v is None or v == "":
            continue
        d = parse_period(str(r["period"]), freq)
        out[d] = transform(float(v), d, kind)
    return sorted(out.items())
 
 
def same_period_years_ago(series, d, years, freq):
    """Value at the same week (nearest obs within 4 days) or same month, N years ago."""
    try:
        target = d.replace(year=d.year - years)
    except ValueError:  # Feb 29
        target = d.replace(year=d.year - years, day=28)
    if freq == "M":
        for sd, v in series:
            if sd == target:
                return v
        return None
    best = None
    for sd, v in series:
        gap = abs((sd - target).days)
        if gap <= 4 and (best is None or gap < best[0]):
            best = (gap, v)
    return best[1] if best else None
 
 
def five_year_vals(series, d, freq):
    vals = [same_period_years_ago(series, d, k, freq) for k in range(1, 6)]
    return None if any(v is None for v in vals) else vals
 
 
def five_year_avg(series, d, freq):
    vals = five_year_vals(series, d, freq)
    return None if vals is None else sum(vals) / 5.0
 
 
def build(cfg, rows, previous):
    key, tab, label, sid, freq, kind, unit, dec, (lo, hi), maxchg = cfg
    s = to_series(rows, freq, kind)
    if len(s) < 300 // (1 if freq == "W" else 4):
        raise ValueError(f"too little history ({len(s)} obs)")
    (d0, v0), (d1, v1) = s[-2], s[-1]
 
    # Validation
    for d, v in s[-10:]:
        if not (lo <= v <= hi):
            raise ValueError(f"value {v:.2f} on {d} outside sane range {lo}-{hi}")
    if abs(v1 - v0) > maxchg:
        raise ValueError(f"change {v1 - v0:.2f} exceeds sane limit {maxchg}")
    if previous and previous.get("period") and d1.isoformat() < previous["period"]:
        raise ValueError(f"latest period {d1} older than saved {previous['period']}")
 
    avg5 = five_year_avg(s, d1, freq)
    diff = None if avg5 is None else v1 - avg5
    # Chart history: last 5 years of [date, level, 5-yr avg, 5-yr min, 5-yr max] for that week
    history = []
    for d, v in s[-HISTORY_POINTS:]:
        vals = five_year_vals(s, d, freq)
        if vals is None:
            history.append([d.isoformat(), round(v, 3), None, None, None])
        else:
            history.append([d.isoformat(), round(v, 3), round(sum(vals) / 5, 3),
                            round(min(vals), 3), round(max(vals), 3)])
    # Forward window: the 5-yr avg/range for the coming weeks (historical pattern only, no estimate)
    forward = []
    if freq == "W":
        for i in range(1, FORWARD_WEEKS + 1):
            f = d1 + dt.timedelta(weeks=i)
            fut = five_year_vals(s, f, freq)
            if fut is None:
                break
            forward.append([f.isoformat(), round(sum(fut) / 5, 3), round(min(fut), 3), round(max(fut), 3)])
    return {
        "history": history,
        "forward": forward,
        "key": key, "tab": tab, "label": label, "series_id": sid,
        "freq": freq, "unit": unit, "decimals": dec,
        "period": d1.isoformat(), "value": v1,
        "prev_period": d0.isoformat(), "change": v1 - v0,
        "avg5": avg5, "vs_avg5": diff,
        "vs_avg5_pct": None if not avg5 else diff / abs(avg5) * 100,
        "ok": True, "error": None,
    }
 
 
def main():
    key = os.environ.get("EIA_API_KEY", "").strip()
    if not key:
        print("EIA_API_KEY not set", file=sys.stderr)
        return 1
 
    previous = {}
    if os.path.exists(OUT):
        with open(OUT) as f:
            previous = {s["key"]: s for s in json.load(f).get("series", [])}
 
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    out, failures = [], 0
    for cfg in SERIES:
        k = cfg[0]
        try:
            rec = build(cfg, fetch_raw(cfg[3], key), previous.get(k))
            rec["checked_at"] = now
            print(f"OK   {k:14s} {rec['period']}  {rec['value']:.2f}")
        except Exception as e:
            failures += 1
            print(f"FAIL {k:14s} {e}", file=sys.stderr)
            rec = dict(previous.get(k) or {"key": k, "tab": cfg[1], "label": cfg[2],
                                            "series_id": cfg[3], "freq": cfg[4],
                                            "unit": cfg[6], "decimals": cfg[7]})
            rec["ok"], rec["error"] = False, str(e)
        out.append(rec)
 
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"generated_at": now, "source": "U.S. Energy Information Administration",
                   "series": out}, f, indent=1)
    os.replace(tmp, OUT)  # atomic write
    return 1 if failures else 0
 
 
if __name__ == "__main__":
    sys.exit(main())
 
