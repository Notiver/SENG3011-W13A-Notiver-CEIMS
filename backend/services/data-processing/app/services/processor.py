import boto3
import json
import requests
from datetime import datetime
from transformers import pipeline

from app import config
from utils.crime_classifier import classify_crime
from utils.location_classifier import get_location_metadata

try:
    session = boto3.Session(profile_name=config.PROFILE_NAME)
    s3 = session.client('s3', region_name=config.REGION)
except Exception:
    s3 = boto3.client('s3', region_name=config.REGION)

def run_nlp_pipeline():
    """Fetches articles via HTTP, processes them, and uploads the JSON results."""

    print("Loading RoBERTa model...")
    sentiment_task = pipeline(
      "sentiment-analysis", 
      model="cardiffnlp/twitter-roberta-base-sentiment-latest", 
      top_k=None
    )

    
    print("Loading RoBERTa model...")
    sentiment_task = pipeline(
        "sentiment-analysis", 
        model="cardiffnlp/twitter-roberta-base-sentiment-latest", 
        top_k=None
    )
    
    collection_url = config.DATA_COLLECTION_URL
    print(f"Fetching articles from {collection_url}...")
    
    try:
        response = requests.get(collection_url)
        response.raise_for_status()
        payload = response.json()
    except Exception as e:
        return {"status": "error", "message": f"Failed to fetch from collection service: {e}"}
        
    articles = payload.get("articles", [])
    
    if not articles:
        return {"status": "success", "message": "No articles found in collection service."}

    processed_count = 0
    skipped_count = 0
    all_processed_data = []

    for article in articles:
        file_key = article["file_key"]
        text_content = article["content"]
        metadata = article.get("metadata", {})

        try:
            loc = get_location_metadata(text_content)
            offence = classify_crime(text_content)
            
            if offence == "General Crime" and loc["suburb"] == "NSW General":
                print(f"Skipping {file_key}: General crime with no specific location.")
                skipped_count += 1
                continue
            
            article_date = metadata.get('publish_date', datetime.now().isoformat())
            
            sentiment_results = sentiment_task(text_content[:1500])
            scores = {res['label']: round(res['score'], 4) for res in sentiment_results[0]}
            negative_sentiment = scores.get('negative', 0)

            base_id = file_key.split('/')[-1].replace('.txt', '')
            output_json = {
                "object_id": base_id,
                "source_type": "news",
                "offence_type": offence,
                "sentiment_score": negative_sentiment,
                "when": article_date,
                "suburb": loc['suburb'],
                "lga": loc['lga'],
                "postcode": loc['postcode']
            }

            all_processed_data.append(output_json)
            processed_count += 1
            
        except Exception as e:
            print(f"Error processing {file_key}: {e}")

    if all_processed_data:
        try:
            final_json_data = json.dumps(all_processed_data, indent=4)
            bulk_s3_key = f"{config.NLP_BUCKET_NAME}/all_processed_articles.json"
            
            s3.put_object(
                Bucket=config.S3_BUCKET_NAME,
                Key=bulk_s3_key,
                Body=final_json_data,
                ContentType='application/json'
            )
            print(f"Successfully uploaded bulk file: s3://{config.S3_BUCKET_NAME}/{bulk_s3_key}")
        except Exception as e:
            print(f"Error uploading bulk JSON file: {e}")

    return {
        "status": "success", 
        "processed": processed_count, 
        "skipped": skipped_count
    }

def fetch_processed_data():
    """Fetches the aggregated JSON file from S3."""
    bulk_s3_key = f"{config.NLP_BUCKET_NAME}/all_processed_articles.json"
    
    try:
        response = s3.get_object(Bucket=config.S3_BUCKET_NAME, Key=bulk_s3_key)
        file_content = response['Body'].read().decode('utf-8')
        
        return json.loads(file_content)
        
    except s3.exceptions.NoSuchKey:
        return {"error": "No processed data found. Please run the NLP pipeline first."}
    except Exception as e:
        raise Exception(f"Failed to fetch data from S3: {str(e)}")