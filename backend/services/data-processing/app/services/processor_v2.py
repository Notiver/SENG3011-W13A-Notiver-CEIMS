import boto3
import json
import requests
from datetime import datetime
from transformers import pipeline

from app import config
from utils.crime_classifier import classify_crime
from utils.location_classifier import get_location_metadata
from aws_lambda_powertools import Tracer

tracer = Tracer(service="data-processing")

try:
    session = boto3.Session(profile_name=config.PROFILE_NAME)
    s3 = session.client('s3', region_name=config.REGION)
except Exception:
    s3 = boto3.client('s3', region_name=config.REGION)

@tracer.capture_method
def run_nlp_pipeline(params: dict = None, user_id: str = "guest"):    
    print("Loading RoBERTa sentiment model...")
    sentiment_task = pipeline(
        "sentiment-analysis", 
        model="cardiffnlp/twitter-roberta-base-sentiment-latest", 
        top_k=None
    )

    collection_url = config.DATA_COLLECTION_URL
    print(f"Triggering collection at {collection_url} with params: {params}")
    
    try:
        payload_request = params or {
            "location": "Sydney, Australia",
            "timeFrame": "5_per_month_1_year",
            "category": "crime"
        }
        
        response = requests.post(collection_url, json=payload_request, timeout=60)
        response.raise_for_status()
        payload = response.json()
    except Exception as e:
        return {"status": "error", "message": f"Failed to reach collection service: {e}"}
        
    articles = payload.get("articles", [])
    if not articles:
        return {"status": "success", "message": "No articles found for these parameters."}

    processed_data = []
    skipped_count = 0

    for article in articles:
        file_key = article.get("file_key")
        text_content = article.get("content", "")
        metadata = article.get("metadata", {})

        if not text_content:
            skipped_count += 1
            continue

        try:
            loc = get_location_metadata(text_content)
            offence = classify_crime(text_content)
            if offence == "General Crime" and loc["suburb"] == "NSW General":
                skipped_count += 1
                continue
            
            sentiment_results = sentiment_task(text_content[:1500])
            scores = {res['label']: round(res['score'], 4) for res in sentiment_results[0]}
            
            negative_sentiment = scores.get('negative', 0)

            base_id = file_key.split('/')[-1].replace('.txt', '') if file_key else "unknown"
            
            entry = {
                "object_id": base_id,
                "source_type": "news",
                "offence_type": offence,
                "sentiment_score": negative_sentiment,
                "when": metadata.get('publish_date', datetime.now().isoformat()),
                "suburb": loc['suburb'],
                "lga": loc['lga'],
                "postcode": loc['postcode'],
                "url": article.get("url", "")
            }

            processed_data.append(entry)
            
        except Exception as e:
            print(f"Error processing {file_key}: {e}")

    if processed_data:
        try:
            final_json_data = json.dumps(processed_data, indent=4)
            bulk_s3_key = f"users/{user_id}/{config.NLP_BUCKET_NAME}/all_processed_articles.json"
            
            s3.put_object(
                Bucket=config.S3_BUCKET_NAME,
                Key=bulk_s3_key,
                Body=final_json_data,
                ContentType='application/json'
            )
            print(f"Uploaded analysis for {user_id} to: {bulk_s3_key}")
        except Exception as e:
            print(f"S3 Upload failed: {e}")

    return {
        "status": "success", 
        "processed": len(processed_data), 
        "skipped": skipped_count
    }

@tracer.capture_method
def fetch_processed_data():
    bulk_s3_key = f"{config.NLP_BUCKET_NAME}/all_processed_articles.json"
    
    try:
        response = s3.get_object(Bucket=config.S3_BUCKET_NAME, Key=bulk_s3_key)
        return json.loads(response['Body'].read().decode('utf-8'))
    except s3.exceptions.NoSuchKey:
        return {"error": "Pipeline has not been run yet."}
    except Exception as e:
        raise Exception(f"S3 Read Error: {str(e)}")