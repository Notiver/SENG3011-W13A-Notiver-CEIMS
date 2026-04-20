import app.config as config
import requests

from collections import defaultdict
from utils.lga_format_dict import LGA_FORMAT_MAP
from utils.crime_dict import CRIME_CATEGORY_MAP, CRIME_WEIGHTS
from utils.LGAData import get_lga_population
from utils.db_manager import get_dynamodb_resource
from utils.SuburbToLGA import suburb_to_lga
from decimal import Decimal
from aws_lambda_powertools import Tracer

tracer = Tracer(service="data-retrieval")

class PipelineError(Exception):
    pass

@tracer.capture_method
def process_retrieval(dynamodb_resource=None, stage="staging"):
    if not dynamodb_resource:
        dynamodb_resource = get_dynamodb_resource()
    
    lga_overall_table = dynamodb_resource.Table(f'lga-overall-{stage}')
    lga_by_year_table = dynamodb_resource.Table(f'lga-by-year-{stage}')

    # 1. Fetch data 
    all_article_events, article_events_by_year = process_articles()
    all_lga_stats, lga_stats_by_year = process_statistics()

    # 2. Process metrics
    lga_sentiment_scores_all = sentiment_scores(all_article_events)
    
    # Run the aggregate ONCE and save the dictionary
    aggregated_stats = lga_aggregate(all_lga_stats)
    
    # Calculate statistical scores from the aggregated data
    lga_statistical_scores_all = stat_score(aggregated_stats)
    
    # Extract total crimes directly from the aggregated data!
    lga_total_crimes = {lga: stats["total_crimes"] for lga, stats in aggregated_stats.items()}

    lga_total_articles = count_total_articles(all_article_events)

    # 3. Upload data 
    upload_lga_overall_data(
        lga_sentiment_scores_all, 
        lga_statistical_scores_all, 
        lga_total_crimes, 
        lga_total_articles, 
        lga_overall_table
    )

    upload_lga_by_year_data(
        lga_stats_by_year, 
        article_events_by_year, 
        lga_by_year_table
    )

@tracer.capture_method(capture_response=False)
def process_articles():
    all_article_events = []
    article_events_by_year = defaultdict(list)

    # --- FIX 1: Safely build the URL to hit the public master file ---
    url = f"{config.API_URL.rstrip('/')}/data-processing/public/ceims-articles"
        
    response = requests.get(url, timeout=15)

    if response.status_code == 200:
        data = response.json()
        
        # --- FIX 2: Safely extract the list out of the dictionary! ---
        if isinstance(data, dict):
            articles = data.get("articles", [])
        else:
            articles = data
            
        all_article_events.extend(articles)
    else:
        raise PipelineError(f"process_articles crashed! URL: {url} | Status: {response.status_code} | Body: {response.text}")

    for event in all_article_events:
        # Extra safety check so missing dates don't crash the loop
        when = event.get('when')
        if when:
            year = when.split('-')[0]
            article_events_by_year[year].append(event)

    return all_article_events, article_events_by_year

@tracer.capture_method(capture_response=False)
def process_statistics():
    all_lga_stats = []
    lga_stats_by_year = defaultdict(list)

    url = config.API_URL.rstrip('/') + "/data-collection/collect-data"
    response = requests.get(url, timeout=15)

    if response.status_code == 200:
        data_link = response.json().get('url')
        response2 = requests.get(data_link, timeout=15)

        if response2.status_code != 200:
            raise PipelineError(f"process_statistics (Data Link) crashed! URL: {data_link} | Status: {response2.status_code} | Body: {response2.text}")

        data = response2.json()
    else:
        raise PipelineError(f"process_statistics (API) crashed! URL: {url} | Status: {response.status_code} | Body: {response.text}")

    if data.get('data_source') != "BOSCAR Data" or data.get('data_type') != "Dataset":
        return all_lga_stats, lga_stats_by_year

    for stat in data.get('events'):
        all_lga_stats.append(stat)
        year = stat.get('time_object').get('date_end').split('-')[0]
        lga_stats_by_year[year].append(stat)

    return all_lga_stats, lga_stats_by_year

@tracer.capture_method
def upload_lga_overall_data(lga_sentiment_scores_all, lga_statistical_scores_all, lga_total_crimes, lga_total_articles, lga_overall_table):
    table_entries = defaultdict(lambda: {
        "sentiment_score": 0,
        "statistical_score": 0,
        "total_crimes": 0,
        "total_articles": 0
    })

    for lga, sent_score in lga_sentiment_scores_all.items():
        table_entries[lga]["sentiment_score"] = Decimal(str(sent_score))
    
    for lga, stat_score in lga_statistical_scores_all.items():
        table_entries[lga]["statistical_score"] = Decimal(str(stat_score))

    for lga, crime_count in lga_total_crimes.items():
        table_entries[lga]["total_crimes"] = crime_count

    for lga, article_count in lga_total_articles.items():
        table_entries[lga]["total_articles"] = article_count

    data = []
    for key, value in table_entries.items():
        item = {
            "lga": key,
            "sentiment_score": value["sentiment_score"],
            "statistical_score": value["statistical_score"],
            "total_crimes": value["total_crimes"],
            "total_articles": value["total_articles"]
        }
        data.append(item)

    with lga_overall_table.batch_writer() as writer:
        for item in data:
            writer.put_item(Item=item)

@tracer.capture_method
def upload_lga_by_year_data(lga_stats_by_year, article_events_by_year, lga_by_year_table):
    table_entries = defaultdict(lambda: {
        "sentiment": 0,
        "stats": 0,
        "total": 0,
        "violent": 0,
        "theft": 0,
        "property": 0,
        "drugs": 0,
        "judicial": 0,
        "other": 0
    })

    for year, stat_list in lga_stats_by_year.items():
        for stat in stat_list:
            lga_suburb = stat.get("lga")
            lga = LGA_FORMAT_MAP.get(lga_suburb.upper(), "LGA mapping not found").title()

            category = CRIME_CATEGORY_MAP.get(stat.get("offence_type").lower(), "other")
            table_entries[(lga, year)]["total"] += stat.get('offence_count')
            table_entries[(lga, year)][category] += stat.get('offence_count')

        statistical_score_by_year = stat_score(lga_aggregate(stat_list))

        for lga, score in statistical_score_by_year.items():
            table_entries[(lga, year)]["stats"] = Decimal(str(score))

    for year, article_list in article_events_by_year.items():
        sentiment_score_by_year = sentiment_scores(article_list)

        for lga, score in sentiment_score_by_year.items():
            table_entries[(lga, year)]["sentiment"] = Decimal(str(score))
 
    data = []
    for key, value in table_entries.items():
        item = {
            "lga": key[0],
            "year": key[1],
            "sentiment": value["sentiment"],
            "stats": value["stats"],
            "total": value["total"],
            "violent": value["violent"],
            "theft": value["theft"],
            "property": value["property"],
            "drugs": value["drugs"],
            "judicial": value["judicial"],
            "other": value["other"]
        }
        data.append(item)

    with lga_by_year_table.batch_writer() as writer:
        for item in data:
            writer.put_item(Item=item)
            
def calculate_housing_score(lga_mean_price):
    if lga_mean_price <= 0:
        return 100.0
        
    # Mathematical Logic: 100 * (0.5 ^ (Price / Mean))
    # This naturally bounds everything between 0 and 100 without hard clamping!
    ratio = lga_mean_price / 1301100
    score = 100 * (0.5 ** ratio)
    
    return max(1.0, min(100.0, score))

@tracer.capture_method(capture_response=False)
def sentiment_housing():
    url = f"{config.API_URL.rstrip('/')}/data-processing/public/housing-articles"
        
    response = requests.get(url, timeout=15)

    if response.status_code == 200:
        data = response.json()
        
        if isinstance(data, dict):
            return data
        
        return {}
    else:
        raise PipelineError(f"process_articles crashed! URL: {url} | Status: {response.status_code} | Body: {response.text}")

@tracer.capture_method
def process_housing(dynamodb_resource=None, stage="staging"):
    """
    Fetches housing data from Team X's API, falls back to manual data if it fails,
    aggregates suburbs into LGAs, calculates a statistical score based on NSW averages,
    and uploads the final metrics to DynamoDB.
    """
    if not dynamodb_resource:
        dynamodb_resource = get_dynamodb_resource()
        
    housing_table = dynamodb_resource.Table(f'lga-housing-{stage}')
    
    suburbs = [
        "Manly", "Randwick", "Chatswood", "Newtown", "Castle Hill", 
        "Blacktown", "Parramatta", "Surry Hills", "Bondi", "Homebush"
    ]
    
    cloudbelly = "https://tvfiek3hzi.execute-api.us-east-1.amazonaws.com/dev/api/v1/analytics/summary"
    
    lga_accumulator = defaultdict(lambda: {"prices": [], "sentiments": []})
    housing_sentiments = sentiment_housing()

    # 1. Fetch data and group by LGA
    for suburb in suburbs:
        lga = suburb_to_lga(suburb)
        
        if lga == "LGA Not Found":
            print(f"Skipping {suburb}: Could not map to an LGA.")
            continue
            
        try:
            # Attempt to hit the actual API to prove integration
            response = requests.get(
                cloudbelly, 
                params={"suburb": suburb, "state": "NSW"}, 
                timeout=3 
            )
            response.raise_for_status()
            api_data = response.json()
            
            price = api_data.get("average")
            sentiment = housing_sentiments.get(lga, 0)
            
        except Exception as e:
            print(f"Team X API failed for {suburb}: {e}.")
            continue
            
        lga_accumulator[lga]["prices"].append(price)
        lga_accumulator[lga]["sentiments"].append(sentiment)

    final_housing_data = []

    # 2. Average the grouped data and calculate statistical scores
    for lga, data in lga_accumulator.items():
        # Calculate the mean price across all suburbs in this LGA
        lga_mean_price = sum(data["prices"]) / len(data["prices"])
        lga_mean_sentiment = sum(data["sentiments"]) / len(data["sentiments"])
        
        # Calculate the dynamic statistical score!
        stat_score = calculate_housing_score(lga_mean_price)
        
        final_housing_data.append({
            "lga": lga,
            "mean_price": Decimal(str(round(lga_mean_price, 2))),
            "statistical_score": Decimal(str(round(stat_score, 2))),
            "sentiment_score": Decimal(str(round(lga_mean_sentiment, 2)))
        })

    # 3. Upload to DynamoDB
    with housing_table.batch_writer() as writer:
        for item in final_housing_data:
            writer.put_item(Item=item)


def count_total_articles(events):
    total_articles = defaultdict(int)

    for event in events:
        lga = event.get("lga")

        if lga != "LGA not found":
            total_articles[lga] += 1
    
    return total_articles

def sentiment_scores(events):
    sent_sum = {}
    sent_count = {}

    for event in events:

        # --- FIX 3: Use the exact key the AI model outputs ---
        severity = event.get("sentiment_score") 
        lga = event.get("lga")

        if severity is None or lga == "LGA not found":
            continue

        sent_sum[lga] = sent_sum.get(lga, 0) + severity
        sent_count[lga] = sent_count.get(lga, 0) + 1

    sent_scores = {}

    for lga in sent_sum:
        sent_scores[lga] = sent_sum[lga] / sent_count[lga]

    return sent_scores


def lga_aggregate(events):
    lga_stats = defaultdict(lambda: {
        "weighted_crime_score": 0,
        "total_crimes": 0
    })

    for event in events:
        offence_type = event.get("offence_type")
        lga_suburb = event.get("lga")
        lga = LGA_FORMAT_MAP.get(lga_suburb.upper(), "LGA mapping not found").title()

        if not offence_type or lga == "LGA mapping not found":
            continue

        offence_type = offence_type.lower()

        weight = CRIME_WEIGHTS.get(offence_type, 1) * event.get("offence_count")
        lga_stats[lga]["weighted_crime_score"] += weight

        lga_stats[lga]["total_crimes"] += event.get("offence_count")

    return lga_stats


def stat_score(lga_stats):
    exponent = 100
    stat_scores = {}

    for lga, stats in lga_stats.items():

        pop = get_lga_population(lga)

        if pop == -1 or pop == 0:
            continue

        weighted_sum = stats["weighted_crime_score"]

        score = (weighted_sum / pop) * exponent

        stat_scores[lga] = score


    return stat_scores