#!/usr/bin/env python3
"""
Dry-run the scraper query-builder against the Guardian Content API and see
EXACTLY what we're asking for before we deploy.

Usage (from repo root):

    # Requires: pip install requests (already in the service's requirements.txt)
    export GUARDIAN_API_KEY=your-key-here  # or leave unset to just print URLs

    python backend/services/data-collection/scripts/debug_scrape.py \
        --location "CUMBERLAND COUNCIL" --category crime --time_frame today

    python backend/services/data-collection/scripts/debug_scrape.py \
        --location "Canterbury-Bankstown Council" --category crime \
        --time_frame 5_per_month_1_year --max-queries 3

Prints:
    * the resolved LGA + suburb list
    * the final Guardian search_query string
    * the actual request URL for each month/day
    * (if GUARDIAN_API_KEY is set) the first N article titles returned,
      so you can eyeball whether Guardian's matches are Australian and on-topic
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import sys
import types


# ----------------------------------------------------------------------
# Bootstrap: load scraper_v2 as a standalone module without needing the
# app.* Lambda packaging to be importable.
# ----------------------------------------------------------------------
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
SERVICE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SCRAPER_PATH = os.path.join(SERVICE_ROOT, "app", "services", "scraper_v2.py")


def _stub(name: str) -> types.ModuleType:
    mod = types.ModuleType(name)
    sys.modules[name] = mod
    return mod


def _install_stubs() -> None:
    # aws_lambda_powertools is optional for dry-run
    aws = _stub("aws_lambda_powertools")

    class _Tracer:
        def __init__(self, **_):
            pass

        def capture_method(self, fn):
            return fn

    aws.Tracer = _Tracer

    # Minimal app.config stub so scraper_v2 can import config constants
    app_pkg = _stub("app")
    app_pkg.__path__ = []  # make it a package-like module
    cfg = _stub("app.config")
    cfg.S3_BUCKET_NAME = "dry-run"
    cfg.NEWS_BUCKET_NAME = "dry-run"
    cfg.REGION = "ap-southeast-2"
    app_pkg.config = cfg

    # newspaper3k + boto3 are imported at module top level but we don't use them here
    _stub("newspaper")
    _stub("boto3")


def _load_scraper():
    _install_stubs()
    spec = importlib.util.spec_from_file_location("scraper_v2", SCRAPER_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    parser = argparse.ArgumentParser(description="Dry-run the Notiver Guardian query builder.")
    parser.add_argument("--location", required=True, help='e.g. "CUMBERLAND COUNCIL" or "Sydney, Australia"')
    parser.add_argument("--category", default="crime",
                        help="CEIMS vector (crime | housing_prices | lifestyle | job_opportunities) "
                             "or interop (stocks | weather | geopolitics | climate)")
    parser.add_argument("--time_frame", default="today",
                        choices=["today", "1_per_day_1_month", "5_per_month_1_year", "1_per_month_5_years"])
    parser.add_argument("--max-queries", type=int, default=3,
                        help="Cap how many month/day requests actually hit Guardian. Default 3.")
    parser.add_argument("--no-fetch", action="store_true",
                        help="Just print the URL(s) without calling Guardian.")
    args = parser.parse_args()

    scraper = _load_scraper()

    # Recreate the scraper's internal query-building logic so we can expose
    # its state. (We deliberately don't call run_dynamic_scraper because it
    # also downloads article bodies, hits S3, etc.)
    import calendar  # noqa: E402
    from datetime import datetime, timedelta  # noqa: E402

    cat_config = scraper.CATEGORY_CONFIG.get(
        args.category, {"query": args.category, "section": None}
    )
    primary_city = args.location.split(",")[0].strip()
    local_mode = "," not in args.location

    # ---- Resolve suburbs ---------------------------------------------------
    suburbs = scraper._suburbs_for_lga(primary_city)
    normalised = scraper._normalise_lga_key(primary_city)
    print("=" * 78)
    print(f"Location input : {args.location!r}")
    print(f"Local mode     : {local_mode}")
    print(f"Primary city   : {primary_city!r}")
    print(f"Normalised LGA : {normalised!r}")
    print(f"Suburbs resolved ({len(suburbs)}): {', '.join(suburbs[:10])}"
          + (" …" if len(suburbs) > 10 else ""))

    # ---- Build the search_query exactly as scraper_v2 would ---------------
    city_variants = [primary_city]
    if "-" in primary_city:
        city_variants.append(primary_city.replace("-", " "))
    if normalised and normalised.upper() != primary_city.upper():
        city_variants.append(normalised.title())

    search_terms: list[str] = []
    seen: set[str] = set()

    def _add(t: str) -> None:
        t = (t or "").strip()
        if not t or len(t) < 4:
            return
        if t.lower() in seen:
            return
        seen.add(t.lower())
        search_terms.append(t)

    for v in city_variants:
        _add(v)
    if local_mode:
        for s in suburbs:
            _add(s)
        QUERY_CAP = 50
        query_terms = search_terms[:QUERY_CAP]
        clause = " OR ".join(f'"{t}"' for t in query_terms)
        search_query = (
            f"({clause}) "
            f"AND (Sydney OR NSW OR \"New South Wales\" OR Australia OR Australian) "
            f"AND {cat_config['query']}"
        )
        section = "australia-news"
    else:
        search_query = f'"{primary_city}" AND {cat_config["query"]}'
        section = cat_config["section"]

    print()
    print(f"Search terms in OR clause ({min(len(search_terms), 50)}/{len(search_terms)}):")
    for t in search_terms[:50]:
        print(f"  • {t}")
    print()
    print(f"Section filter : {section}")
    print(f"Final q=       : {search_query}")
    print("=" * 78)

    # ---- Build the same api_queries list scraper_v2 would ----------------
    now = datetime.now()
    api_queries: list[dict] = []
    tf = args.time_frame
    if tf == "today":
        api_queries.append({"from_date": now.strftime("%Y-%m-%d"),
                            "to_date": now.strftime("%Y-%m-%d"),
                            "page_size": 15})
    elif tf == "1_per_day_1_month":
        for i in range(30):
            d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
            api_queries.append({"from_date": d, "to_date": d, "page_size": 2})
    elif tf == "5_per_month_1_year":
        for i in range(12):
            month = now.month - i
            year = now.year
            while month <= 0:
                month += 12
                year -= 1
            _, last = calendar.monthrange(year, month)
            api_queries.append({
                "from_date": f"{year}-{month:02d}-01",
                "to_date": f"{year}-{month:02d}-{last:02d}",
                "page_size": 8,
            })
    elif tf == "1_per_month_5_years":
        for i in range(60):
            month = now.month - i
            year = now.year
            while month <= 0:
                month += 12
                year -= 1
            _, last = calendar.monthrange(year, month)
            api_queries.append({
                "from_date": f"{year}-{month:02d}-01",
                "to_date": f"{year}-{month:02d}-{last:02d}",
                "page_size": 2,
            })

    url = "https://content.guardianapis.com/search"
    api_key = os.getenv("GUARDIAN_API_KEY", "test")

    queries_to_run = api_queries[: args.max_queries]
    print(f"Will inspect {len(queries_to_run)} of {len(api_queries)} date windows.\n")

    try:
        import requests  # imported lazily so --no-fetch works without a venv
    except Exception:
        requests = None  # type: ignore[assignment]

    for q in queries_to_run:
        params = {
            "q": search_query,
            "from-date": q["from_date"],
            "to-date": q["to_date"],
            "page-size": q["page_size"],
            "api-key": api_key,
            "order-by": "relevance",
        }
        if section:
            params["section"] = section

        if args.no_fetch or requests is None:
            # Build the URL without hitting the network.
            from urllib.parse import urlencode
            printed = f"{url}?{urlencode(params)}"
            print(f"[{q['from_date']} → {q['to_date']}]  {printed}")
            continue

        try:
            resp = requests.get(url, params=params, timeout=15)
            print(f"[{q['from_date']} → {q['to_date']}]  {resp.url}")
            if resp.status_code != 200:
                print(f"  !! status {resp.status_code}: {resp.text[:300]}")
                continue
            results = resp.json().get("response", {}).get("results", []) or []
            print(f"  → {len(results)} results")
            for item in results[:5]:
                title = item.get("webTitle", "(no title)")
                section_name = item.get("sectionName", "")
                pub = item.get("webPublicationDate", "")
                web_url = item.get("webUrl", "")
                print(f"    · [{section_name}] {title}  ({pub})")
                print(f"        {web_url}")
        except Exception as e:
            print(f"  !! request failed: {e}")
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
