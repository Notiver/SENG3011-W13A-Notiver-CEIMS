import boto3
import json
import app.config as config

from collections import defaultdict
from utils.lga_format_dict import LGA_FORMAT_MAP
from utils.crime_dict import CRIME_CATEGORY_MAP, CRIME_WEIGHTS
from utils.LGAData import get_lga_population

all_article_events = []
article_events_by_year = defaultdict(list)
all_lga_stats = []
lga_stats_by_year = defaultdict(list)

# Initialise AWS session and connect to S3 data
try:
    session = boto3.Session(profile_name=config.PROFILE_NAME)
    s3 = session.client('s3', region_name=config.REGION)
except Exception:
    s3 = boto3.client('s3', region_name=config.REGION)

# Connect to DynamoDB data
dynamodb = session.resource('dynamodb', region_name=config.REGION)
lga_overall_table = dynamodb.Table('lga-overall')
lga_by_year_table = dynamodb.Table('lga-by-year')


def process_retrieval():

    process_articles()
    process_statistics()

    lga_sentiment_scores_all = sentiment_scores(all_article_events)
    lga_statistical_scores_all = stat_score(lga_aggregate(all_lga_stats))
    lga_total_crimes = count_total_crimes(all_lga_stats)
    lga_total_articles = count_total_articles(all_article_events)

    upload_lga_overall_data(lga_sentiment_scores_all, lga_statistical_scores_all, lga_total_crimes, lga_total_articles)

    upload_lga_by_year_data()


def process_articles():
    file_key = "nlp_processed/all_processed_articles.json"

    try:
        response = s3.get_object(Bucket=config.S3_BUCKET_NAME, Key=file_key)
        text_content = response['Body'].read().decode('utf-8')
        data = json.loads(text_content)
        all_article_events.extend(data)


    except Exception as e:
        print(f"Error processing {file_key}: {e}")  

    for event in all_article_events:
        year = event.get('when').split('-')[0]
        article_events_by_year[year].append(event)

    return


def process_statistics():
    file_key = "boscar/crime_data.json"

    try:
        response = s3.get_object(Bucket=config.S3_BUCKET_NAME, Key=file_key)
        text_content = response['Body'].read().decode('utf-8')
        data = json.loads(text_content)

    except Exception as e:
        print(f"Error processing {file_key}: {e}")  

    if data.get('data_source') != "BOSCAR Data" or data.get('data_type') != "Dataset":
        return

    for stat in data.get('events'):
        all_lga_stats.append(stat)

        year = stat.get('time_object').get('date_end').split('-')[0]
        lga_stats_by_year[year].append(stat)

    return


    # Overall stats
    # lga | sentiment | statistical | total crimes | total articles


    # By year
    # lga | year | sentiment | stats | total | violent | theft | property | drugs | judicial | other 



def upload_lga_overall_data(lga_sentiment_scores_all, lga_statistical_scores_all, lga_total_crimes, lga_total_articles):
    table_entries = defaultdict(lambda: {
        "sentiment_score": 0,
        "statistical_score": 0,
        "total_crimes": 0,
        "total_articles": 0
    })

    for lga, sent_score in lga_sentiment_scores_all.items():
        table_entries[lga]["sentiment_score"] = str(sent_score)
    
    for lga, stat_score in lga_statistical_scores_all.items():
        table_entries[lga]["statistical_score"] = str(stat_score)

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


def upload_lga_by_year_data():
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

    for year, list in lga_stats_by_year.items():
        for stat in list:
            lga_suburb = stat.get("lga")
            lga = LGA_FORMAT_MAP.get(lga_suburb.upper(), "LGA mapping not found").title()

            category = CRIME_CATEGORY_MAP.get(stat.get("offence_type").lower(), "other")
            table_entries[(lga, year)]["total"] += 1
            table_entries[(lga, year)][category] += 1

        statistical_score_by_year = stat_score(lga_aggregate(list))

        for lga, score in statistical_score_by_year.items():
            table_entries[(lga, year)]["stats"] = str(score)

    for year, list in article_events_by_year.items():
        sentiment_score_by_year = sentiment_scores(list)

        for lga, score in sentiment_score_by_year.items():
            table_entries[(lga, year)]["sentiment"] = str(score)
 
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

    return

def count_total_articles(events):
    total_articles = defaultdict(int)

    for event in events:
        lga = event.get("lga")

        if lga != "LGA not found":
            total_articles[lga] += 1
    
    return total_articles


def count_total_crimes(events):
    total_crimes = defaultdict(int)

    for event in events:
        lga_suburb = event.get("lga")
        lga = LGA_FORMAT_MAP.get(lga_suburb.upper(), "LGA mapping not found").title()

        if lga != "LGA mapping not found":
            total_crimes[lga] += event.get("offence_count")

    return total_crimes



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
        lga = event.get("lga")

        
        if not offence_type or lga == "LGA not found":
            continue

        offence_type = offence_type.lower()

        # get weight of crime
        weight = CRIME_WEIGHTS.get(offence_type, 1)

        lga_stats[lga]["weighted_crime_score"] += weight
        lga_stats[lga]["total_crimes"] += 1

    return lga_stats


def stat_score(lga_stats):
    exponent = 1000000
    stat_scores = {}

    for lga_suburb, stats in lga_stats.items():
        
        lga = LGA_FORMAT_MAP.get(lga_suburb.upper(), "LGA mapping not found").title()

        pop = get_lga_population(lga)

        if pop == -1 or pop == 0:
            print(lga)
            print(lga_suburb)
            continue

        weighted_sum = stats["weighted_crime_score"]

        score = (weighted_sum / pop) * exponent

        stat_scores[lga] = score


    return stat_scores


if __name__ == "__main__":
    process_retrieval()