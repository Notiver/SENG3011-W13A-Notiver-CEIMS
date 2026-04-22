import requests
import newspaper
import boto3
import os
import json
import traceback
import calendar
from datetime import datetime, timedelta
from functools import lru_cache
from app import config
from aws_lambda_powertools import Tracer

tracer = Tracer(service="data-collection")


# ---------------------------------------------------------------------------
# Suburb-to-LGA expansion
#
# Australian news articles almost always reference the suburb name
# ("Punchbowl", "Bankstown") rather than the council name
# ("Canterbury-Bankstown"). When a user targets an LGA we expand the Guardian
# search and the relevance filter to every suburb that belongs to that LGA,
# so a Punchbowl stabbing lands under its parent council automatically.
# ---------------------------------------------------------------------------

_SUBURB_DATA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "utils", "SUBURB_TO_LGA_DATA.json"
)


def _normalise_lga_key(raw: str) -> str:
    """
    Accept either the `lganame` ("CUMBERLAND") or the `councilname`
    ("CUMBERLAND COUNCIL", "THE COUNCIL OF THE CITY OF SYDNEY", etc.) and
    reduce it to the LGA-name form used as the index key. The
    /data-retrieval/lgas endpoint stores council names, so the scraper has
    to resolve either form.
    """
    if not raw:
        return ""
    k = raw.strip().upper()

    # Leading "(THE) COUNCIL OF THE (CITY|SHIRE|MUNICIPALITY) OF ..." -> drop it.
    prefixes = (
        "THE COUNCIL OF THE CITY OF ",
        "THE COUNCIL OF THE SHIRE OF ",
        "THE COUNCIL OF THE MUNICIPALITY OF ",
        "COUNCIL OF THE CITY OF ",
        "COUNCIL OF THE SHIRE OF ",
        "COUNCIL OF THE MUNICIPALITY OF ",
        "CITY OF ",
        "SHIRE OF ",
        "MUNICIPALITY OF ",
    )
    for p in prefixes:
        if k.startswith(p):
            k = k[len(p):]
            break

    # Trailing "(REGIONAL|CITY|SHIRE|MUNICIPAL) COUNCIL" / "COUNCIL" -> drop it.
    suffixes = (
        " REGIONAL COUNCIL",
        " MUNICIPAL COUNCIL",
        " SHIRE COUNCIL",
        " CITY COUNCIL",
        " COUNCIL",
        " SHIRE",
        " CITY",
        " MUNICIPALITY",
    )
    for s in suffixes:
        if k.endswith(s):
            k = k[: -len(s)]
            break

    return k.strip()


@lru_cache(maxsize=1)
def _load_lga_suburb_index():
    """
    Return { key -> [suburb, ...] } where key is both the LGA name (e.g.
    "CUMBERLAND") and the full council name (e.g. "CUMBERLAND COUNCIL").
    Caller may pass either form.
    """
    try:
        with open(_SUBURB_DATA_PATH, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except Exception as exc:
        print(f"SUBURB_TO_LGA_DATA unavailable ({exc}); proceeding without suburb expansion.")
        return {}

    index: dict[str, list[str]] = {}
    for suburb, meta in raw.items():
        lga = (meta.get("lganame") or "").strip().upper()
        council = (meta.get("councilname") or "").strip().upper()
        if not lga and not council:
            continue
        suburb_name = suburb.strip()
        for key in (lga, council, _normalise_lga_key(council)):
            if key:
                index.setdefault(key, []).append(suburb_name)

    # Deduplicate the suburb lists (same suburb can be inserted under both
    # the lganame and councilname keys).
    for key, suburbs in index.items():
        seen: set[str] = set()
        deduped: list[str] = []
        for s in suburbs:
            if s in seen:
                continue
            seen.add(s)
            deduped.append(s)
        index[key] = deduped
    return index


def _suburbs_for_lga(lga_name: str) -> list[str]:
    if not lga_name:
        return []
    idx = _load_lga_suburb_index()
    key_upper = lga_name.strip().upper()
    # Try: exact council name -> exact LGA name -> normalised key.
    for candidate in (key_upper, _normalise_lga_key(lga_name)):
        if candidate and candidate in idx:
            return idx[candidate]
    return []

CATEGORY_CONFIG = {
    "crime": {"query": "(police OR crime OR murder OR theft)", "section": "news|world|australia-news"},
    "housing_prices": {"query": "(housing OR real estate OR property OR rent)", "section": "business|money|society"},
    "lifestyle": {"query": "(lifestyle OR culture OR events OR community)", "section": "lifeandstyle|culture"},
    "job_opportunities": {"query": "(jobs OR employment OR economy OR hiring)", "section": "business|money"},
    "stocks": {"query": '("stock market" OR shares OR asx OR finance OR equities)', "section": "business|money"},
    "weather": {"query": "(weather OR forecast OR storm OR flood)", "section": "news|environment"},
    "geopolitics": {"query": "(geopolitics OR foreign policy OR international relations)", "section": "world|politics"},
    "climate": {"query": "(climate change OR environment OR emissions)", "section": "environment|science"}
}

@tracer.capture_method
def run_dynamic_scraper(location: str, time_frame: str, category: str, user_id: str = "guest_user"):
    print(f"Starting dynamic scrape for User: {user_id} | Loc: {location} | Cat: {category} | Time: {time_frame}")

    cat_config = CATEGORY_CONFIG.get(category, {"query": category, "section": None})
    primary_city = location.split(',')[0].strip()

    # Locations without a country suffix (e.g. "Canterbury-Bankstown") are
    # treated as NSW LGAs. For those we constrain both the Guardian query and
    # the section so UK / global articles that happen to share a token
    # ("Canterbury" in Kent, "Sydney" in a UK context, etc.) can't bleed in.
    local_mode = "," not in location

    # For hyphenated LGA names, Guardian tokenises the phrase loosely. We
    # search for both the hyphenated form and the space-separated form so
    # either headline style ("Canterbury-Bankstown" vs "Canterbury Bankstown")
    # lands a hit.
    city_variants = [primary_city]
    if "-" in primary_city:
        city_variants.append(primary_city.replace("-", " "))

    # If the caller passed the full council name ("CUMBERLAND COUNCIL") also
    # try the bare LGA form ("CUMBERLAND") — the generic "COUNCIL" suffix
    # weakens the Guardian match and pulls in UK council articles.
    normalised = _normalise_lga_key(primary_city)
    if normalised and normalised.upper() != primary_city.upper():
        city_variants.append(normalised.title())

    # The complete list of Guardian search terms for this job. In local mode
    # we expand to cover every suburb in the selected LGA because AU news
    # references suburbs far more often than council names.
    search_terms: list[str] = []
    seen_lc: set[str] = set()

    def _add_term(term: str) -> None:
        t = (term or "").strip()
        if not t or len(t) < 4:
            return  # drop pathologically short tokens (avoid false positives)
        key = t.lower()
        if key in seen_lc:
            return
        seen_lc.add(key)
        search_terms.append(t)

    for v in city_variants:
        _add_term(v)

    if local_mode:
        for suburb in _suburbs_for_lga(primary_city):
            _add_term(suburb)

        # Guardian accepts long q= strings, but keep the OR list bounded so
        # the request URL stays well under 8 KB even when a council has
        # 150+ suburbs (Mid-Coast, Central Coast, etc.).
        QUERY_CAP = 50
        query_terms = search_terms[:QUERY_CAP]
        clause = " OR ".join(f'"{t}"' for t in query_terms)
        search_query = (
            f'({clause}) '
            f'AND (Sydney OR NSW OR "New South Wales" OR Australia OR Australian) '
            f'AND {cat_config["query"]}'
        )
        section_override = "australia-news"
        print(
            f"Local mode expansion: {len(search_terms)} terms "
            f"(LGA + {max(0, len(search_terms) - len(city_variants))} suburbs), "
            f"querying top {len(query_terms)}."
        )
    else:
        search_query = f'"{primary_city}" AND {cat_config["query"]}'
        section_override = None

    current_date = datetime.now()
    api_queries = []

    # `page_size` is padded above the user-visible target so that losses from
    # paywalls, failed downloads and the city-mention filter don't leave the
    # bucket underfilled. The frontend still shows the target in its progress
    # labels; any extra articles are a pleasant surprise.

    if time_frame == "1_per_month_5_years":
        for i in range(60):
            target_month = current_date.month - i
            target_year = current_date.year
            while target_month <= 0:
                target_month += 12
                target_year -= 1

            _, last_day = calendar.monthrange(target_year, target_month)
            api_queries.append({
                "from_date": f"{target_year}-{target_month:02d}-01",
                "to_date": f"{target_year}-{target_month:02d}-{last_day:02d}",
                "page_size": 2  # target 1, pad 1 for filtering losses
            })

    elif time_frame == "5_per_month_1_year":
        for i in range(12):
            target_month = current_date.month - i
            target_year = current_date.year
            while target_month <= 0:
                target_month += 12
                target_year -= 1

            _, last_day = calendar.monthrange(target_year, target_month)
            api_queries.append({
                "from_date": f"{target_year}-{target_month:02d}-01",
                "to_date": f"{target_year}-{target_month:02d}-{last_day:02d}",
                "page_size": 8  # target 5, pad 3 for filtering losses
            })

    elif time_frame == "1_per_day_1_month":
        for i in range(30):
            target_date = current_date - timedelta(days=i)
            date_str = target_date.strftime("%Y-%m-%d")
            api_queries.append({
                "from_date": date_str,
                "to_date": date_str,
                "page_size": 2  # target 1, pad 1 for filtering losses
            })

    elif time_frame == "today":
        # "Scrape today" button — everything published today for this target.
        today_str = current_date.strftime("%Y-%m-%d")
        api_queries.append({
            "from_date": today_str,
            "to_date": today_str,
            "page_size": 15  # up to 15 top results from today
        })

    else:
        api_queries.append({
            "from_date": f"{current_date.year}-01-01",
            "to_date": f"{current_date.year}-12-31",
            "page_size": 8
        })

    url = "https://content.guardianapis.com/search"
    api_key = os.getenv("GUARDIAN_API_KEY", "test")    
    
    article_data = {}
    
    for q in api_queries:
        params = {
            "q": search_query,
            "from-date": q["from_date"],        
            "to-date": q["to_date"],          
            "page-size": q["page_size"],                   
            "api-key": api_key,
            "order-by": "relevance"
        }
        
        if section_override:
            params["section"] = section_override
        elif cat_config["section"]:
            params["section"] = cat_config["section"]
            
        try:
            response = requests.get(url, params=params, timeout=10)
            # Always log the final URL for the first request of each job so
            # CloudWatch shows us exactly what the Guardian is being asked
            # — the easiest way to debug CEIMS "wrong article" reports.
            print(f"GUARDIAN REQ [{q['from_date']} -> {q['to_date']}]: {response.url}")
            if response.status_code == 200:
                results = response.json().get("response", {}).get("results", [])
                print(f"  -> {len(results)} results returned")
                for item in results:
                    web_url = item.get('webUrl')
                    # Guardian's webPublicationDate is the authoritative publish
                    # date — keep it as-is and skip articles without one rather
                    # than substituting today's date.
                    pub_date = item.get('webPublicationDate')

                    if web_url and pub_date:
                        article_data[web_url] = pub_date
            else:
                print(f"API ERROR {response.status_code}: {response.text}")
        except Exception as e:
            print(f"Guardian API Request failed for {q['from_date']}: {e}")

    print(f"Found {len(article_data)} URLs. Scraping content...")

    try:
        s3 = boto3.client('s3')
    except Exception as e:
        print(f"CRITICAL: Failed to initialize Boto3: {e}")
        print(traceback.format_exc())
        raise e

    scraped_data = []

    # Lowercased term list for the per-article body relevance check. For LGA
    # mode this covers the council name plus every suburb; for global mode
    # it's just the primary city.
    match_terms_lc = [t.lower() for t in (search_terms if local_mode else [primary_city])]
    AUS_TOKENS = ("nsw", "new south wales", "sydney", "australia", "australian")

    for i, (article_url, real_publish_date) in enumerate(article_data.items()):
        try:
            article = newspaper.article(article_url)
            article.download()
            article.parse()
            content = article.text

            if content:
                body = content.lower()
                if local_mode:
                    # For NSW LGAs the body must mention the council or one
                    # of its suburbs AND sit in an Australian context. This
                    # rejects UK / global articles that happen to drop a
                    # one-word mention in passing.
                    has_term = any(t in body for t in match_terms_lc)
                    has_aus = any(t in body for t in AUS_TOKENS)
                    if not (has_term and has_aus):
                        print(
                            f"Skipped (no AU + '{primary_city}' or suburb context): {article_url}"
                        )
                        continue
                else:
                    # Global locations — a single body mention suffices.
                    if body.count(primary_city.lower()) < 1:
                        print(f"Skipped (no body mention of '{primary_city}'): {article_url}")
                        continue

            real_title = article.title if article.title else "News Report"

            # Prefer Guardian's webPublicationDate — it's reliable and always
            # the actual publication date. newspaper3k's publish_date parser
            # often falls through to today's HTTP response date, which is how
            # articles were ending up stamped "today" in the UI.
            if real_publish_date:
                final_date = real_publish_date
            elif article.publish_date:
                final_date = article.publish_date.isoformat()
            else:
                final_date = None  # surface "unknown date" honestly

            if content:
                safe_cat = category.replace(" ", "_")
                s3_key = f"users/{user_id}/{config.NEWS_BUCKET_NAME}/{safe_cat}_{i}.txt"

                s3.put_object(
                    Bucket=config.S3_BUCKET_NAME,
                    Key=s3_key,
                    Body=content,
                    ContentType='text/plain'
                )

                scraped_data.append({
                    "file_key": s3_key,
                    "url": article_url,
                    "content": content,
                    "title": real_title,
                    "metadata": {"publish_date": final_date}
                })
        except Exception as e:
            print(f"FAILED ON ARTICLE {article_url}: {e}")
            print(traceback.format_exc())

    return scraped_data