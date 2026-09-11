#!/usr/bin/env python3
"""Run a synthetic integration example against the local Delineo stack.

Run with Algorithms/.venv/bin/python from the sibling-repository workspace.
Creates a new demo zone and saved run. No source mobility data is used.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import ipaddress
import json
from pathlib import Path
import sys
import time
from urllib.parse import urlparse

import pandas as pd
import requests


WORKSPACE = Path(__file__).resolve().parents[3]
CBG = "240010001001"
HOURS = 24
MINUTES = HOURS * 60


def local_url(value: str) -> str:
    parsed = urlparse(value)
    try:
        loopback = parsed.hostname == "localhost" or ipaddress.ip_address(
            parsed.hostname or ""
        ).is_loopback
    except ValueError:
        loopback = False
    if parsed.scheme != "http" or not loopback or parsed.username or parsed.password:
        raise argparse.ArgumentTypeError("Use an http:// loopback URL for this local demo")
    if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise argparse.ArgumentTypeError("Use a service origin without a path or query")
    return value.rstrip("/")


def checked(response: requests.Response) -> dict:
    if not response.ok:
        raise RuntimeError(f"{response.request.method} {response.url}: "
                           f"HTTP {response.status_code}: {response.text[:500]}")
    return response.json()


def example_inputs():
    sys.path.insert(0, str(WORKSPACE / "Algorithms" / "server"))
    from patterns import gen_patterns
    from patterns_loader import PatternsData

    papdata = {
        "people": {
            str(p): {"age": 20 + p % 6 * 5, "sex": p % 2, "home": str(1 + (p - 1) // 4)}
            for p in range(1, 13)
        },
        "homes": {
            str(h): {"cbg": CBG, "latitude": 39.65 + h * 0.001, "longitude": -78.76}
            for h in range(1, 4)
        },
        "places": {
            str(p): {"cbg": CBG, "placekey": f"synthetic-{p}",
                     "label": f"Synthetic POI {p - 99}", "top_category": "Demo",
                     "area": 200, "latitude": 39.652, "longitude": -78.76 + (p - 99) * 0.001}
            for p in (100, 101)
        },
    }
    weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    stats = pd.DataFrame([
        {"placekey": place["placekey"], "median_dwell": 60,
         "popularity_by_hour": [0] * 8 + [90] * 10 + [0] * 6,
         "popularity_by_day": {day: 10 for day in weekdays},
         "raw_visit_counts": 100, "normalized_visits_by_state_scaling": 100,
         "visitor_home_cbgs": json.dumps({CBG: 100}),
         "open_hours": json.dumps({day: [[8, 18]] for day in
                                   ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}),
         "naics_code": "445110"}
        for place in papdata["places"].values()
    ])
    patterns = gen_patterns(papdata, datetime(2021, 4, 5), duration=HOURS,
                            shared_data=PatternsData(stats))
    expected_people = set(papdata["people"])
    if len(patterns) != HOURS:
        raise RuntimeError(f"Expected {HOURS} movement frames, got {len(patterns)}")
    for frame in patterns.values():
        people = [person for group in ("homes", "places")
                  for members in frame[group].values() for person in members]
        if len(people) != len(expected_people) or set(people) != expected_people:
            raise RuntimeError("Movement did not conserve the demo population")
    if not any(members for frame in patterns.values() for members in frame["places"].values()):
        raise RuntimeError("The example generated no POI visits")
    return papdata, patterns


def wait_for_json(session, url, ready_key, timeout=120):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = session.get(url, timeout=30)
        payload = checked(response)
        data = payload.get("data", {})
        if response.status_code == 200 and data.get(ready_key):
            return data
        if response.status_code not in (200, 202):
            raise RuntimeError(f"Unexpected HTTP {response.status_code} from {url}")
        time.sleep(1)
    raise RuntimeError(f"Timed out waiting for processed output: {url}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fullstack-url", type=local_url, default="http://localhost:3000")
    parser.add_argument("--algorithms-url", type=local_url, default="http://localhost:1880")
    parser.add_argument("--simulation-url", type=local_url, default="http://localhost:1870")
    parser.add_argument("--dmp-mode", choices=("off", "required"), default="off")
    args = parser.parse_args()
    with requests.Session() as session:
        # Ignore proxy environment variables for these explicitly local requests.
        session.trust_env = False
        checked(session.get(f"{args.fullstack_url}/api/convenience-zones?all=true", timeout=60))
        checked(session.get(f"{args.algorithms_url}/pattern-availability?state=OK&start_date=2021-04-05&end_date=2021-04-05", timeout=30))
        health = checked(session.get(f"{args.simulation_url}/", timeout=30))
        if health.get("service") != "delineo-simulation" or health.get("status") != "ok":
            raise RuntimeError("Unexpected Simulation health response")
        papdata, patterns = example_inputs()
        print(f"Generated {len(papdata['people'])} people and {len(patterns)} hourly movement frames")
        zone = checked(session.post(f"{args.fullstack_url}/api/convenience-zones", json={
            "name": f"Synthetic onboarding demo ({args.dmp_mode})",
            "description": "Artificial software integration example; no real population or mobility data.",
            "latitude": 39.652, "longitude": -78.76, "cbg_list": [CBG],
            "size": 12, "start_date": "2021-04-05T00:00:00Z", "length": HOURS,
        }, timeout=60))["data"]
        zone_id = zone["id"]
        print(f"Created demo zone {zone_id}")
        checked(session.post(f"{args.fullstack_url}/api/patterns", data={"czone_id": zone_id}, files={
            "papdata": ("papdata.json", json.dumps(papdata).encode(), "application/json"),
            "patterns": ("patterns.json", json.dumps(patterns).encode(), "application/json"),
        }, timeout=60))
        request = {
            "czone_id": zone_id, "length": MINUTES, "randseed": False,
            "random_seed": 42, "initial_infected_count": 1,
            "disease_name": "COVID-19", "variants": ["Delta"], "dmp_mode": args.dmp_mode,
            "interventions": [{"time": 0, "mask": 0, "vaccine": 0,
                               "capacity": 1, "lockdown": 0, "selfiso": 0}],
        }
        run_id = None
        with session.post(f"{args.simulation_url}/simulation/", json=request,
                          stream=True, timeout=(10, 180)) as response:
            response.raise_for_status()
            if "text/event-stream" not in response.headers.get("Content-Type", ""):
                raise RuntimeError("Expected an SSE simulation response")
            for line in response.iter_lines():
                if not line.startswith(b"data:"):
                    continue
                event = json.loads(line[5:].strip())
                if event.get("type") == "error":
                    raise RuntimeError(f"Simulation failed: {event}")
                if event.get("type") == "result":
                    run_id = event["data"]["id"]
        if run_id is None:
            raise RuntimeError("Simulation stream ended without a result ID")
        charts = wait_for_json(session, f"{args.fullstack_url}/api/simdata/{run_id}/chartdata", "iot")
        result_map = wait_for_json(session, f"{args.fullstack_url}/api/simdata/{run_id}/map", "timesteps")
        if len(charts["iot"]) != HOURS or len(result_map["timesteps"]) != HOURS:
            raise RuntimeError("Stored output does not cover all 24 hourly frames")
        checked(session.post(f"{args.fullstack_url}/api/simdata/{run_id}/save", json={
            "saved": True, "name": f"Synthetic onboarding demo ({args.dmp_mode})",
        }, timeout=30))
        print(f"PASS: zone={zone_id}, run={run_id}, dmp_mode={args.dmp_mode}, "
              f"chart_frames={len(charts['iot'])}, map_frames={len(result_map['timesteps'])}")
        print(f"Open {args.fullstack_url}/simulator/{run_id}")


if __name__ == "__main__":
    try:
        main()
    except (requests.RequestException, RuntimeError, KeyError, ValueError) as error:
        raise SystemExit(f"FAIL: {error}") from error
