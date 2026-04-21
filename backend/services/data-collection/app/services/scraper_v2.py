import requests
import newspaper
import boto3
import os
import traceback
import calendar
from datetime import datetime, timedelta
from app import config
from aws_lambda_powertools import Tracer

tracer = Tracer(service="data-collection")

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
    search_query = f'"{primary_city}" AND {cat_config["query"]}'
    
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
        
        if cat_config["section"]:
            params["section"] = cat_config["section"]
            
        try:
            response = requests.get(url, params=params, timeout=10)
            if response.status_code == 200:
                results = response.json().get("response", {}).get("results", [])
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
                print(f"DEBUG URL: {response.url}")
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

    for i, (article_url, real_publish_date) in enumerate(article_data.items()):
        try:
            article = newspaper.article(article_url)
            article.download()
            article.parse()
            content = article.text

            # The Guardian search already filters on the city keyword, so we
            # just need a light sanity check that the body mentions it at
            # least once. Previously we required >= 3 mentions which was too
            # aggressive and commonly trimmed 60 target articles to ~6.
            if content:
                mention_count = content.lower().count(primary_city.lower())
                if mention_count < 1:
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