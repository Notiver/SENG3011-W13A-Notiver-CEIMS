import boto3
import app.config as config
import requests

from collections import defaultdict
from utils.lga_format_dict import LGA_FORMAT_MAP
from utils.crime_dict import CRIME_CATEGORY_MAP, CRIME_WEIGHTS
from utils.LGAData import get_lga_population
from decimal import Decimal
from aws_lambda_powertools import Tracer

tracer = Tracer(service="data-retrieval")

class PipelineError(Exception):
    pass

def get_dynamodb_resource():
    """Function to initialize the resource."""
    try:
        session = boto3.Session(profile_name=config.PROFILE_NAME)
        return session.resource('dynamodb', region_name=config.REGION)
    except Exception:
        return boto3.resource('dynamodb', region_name=config.REGION)

@tracer.capture_method
def process_retrieval(dynamodb_resource=None):
    if not dynamodb_resource:
        dynamodb_resource = get_dynamodb_resource()
    
    lga_overall_table = dynamodb_resource.Table('lga-overall')
    lga_by_year_table = dynamodb_resource.Table('lga-by-year')

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
    # -----------------------

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

@tracer.capture_method
def process_articles():
    all_article_events = []
    article_events_by_year = defaultdict(list)

    url = config.API_URL + "/data-processing/processed-articles"
    response = requests.get(url)

    if response.status_code == 200:
        data = response.json()
        all_article_events.extend(data)
    else:
        # Replaced sys.exit() with an exception
        raise PipelineError(f"Error {response.status_code}: {response.reason}")

    for event in all_article_events:
        year = event.get('when').split('-')[0]
        article_events_by_year[year].append(event)

    return all_article_events, article_events_by_year

@tracer.capture_method
def process_statistics():
    all_lga_stats = []
    lga_stats_by_year = defaultdict(list)

    url = config.API_URL + "/data-collection/collect-data"
    response = requests.get(url)

    if response.status_code == 200:
        data_link = response.json().get('url')
        response2 = requests.get(data_link)

        if response2.status_code != 200:
            raise PipelineError(f"Error {response2.status_code}: {response2.reason}")

        data = response2.json()
    else:
        raise PipelineError(f"Error {response.status_code}: {response.reason}")

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

        severity = event.get("severity_score")
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


if __name__ == "__main__":
    process_retrieval()
