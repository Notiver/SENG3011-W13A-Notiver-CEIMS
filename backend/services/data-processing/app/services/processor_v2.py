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
    s3 = session.client('s3', region_name=config.REGION if hasattr(config, 'REGION') else "ap-southeast-2")
except Exception:
    s3 = boto3.client('s3', region_name=config.REGION if hasattr(config, 'REGION') else "ap-southeast-2")

@tracer.capture_method
def run_nlp_pipeline(job_id: str, user_id: str = "guest_user", auth_header: str = None, params: dict = None):    
    print("Loading RoBERTa sentiment model...")
    with tracer.provider.in_subsegment("Load_RoBERTa_Model"):        
        sentiment_task = pipeline(
            "sentiment-analysis", 
            model="cardiffnlp/twitter-roberta-base-sentiment-latest", 
            top_k=None
        )

    base_url = config.DATA_COLLECTION_URL.rstrip('/')
    target_api_url = f"{base_url}/{job_id}"
    print(f"Fetching scraped data from API: {target_api_url}")
    
    headers = {"Authorization": auth_header} if auth_header else {}
    
    try:
        response = requests.get(target_api_url, headers=headers, timeout=30)
        response.raise_for_status()
        payload = response.json()
        
        while isinstance(payload, str):
            payload = json.loads(payload)
            
        if isinstance(payload, dict) and "body" in payload:
            body_content = payload["body"]
            while isinstance(body_content, str):
                body_content = json.loads(body_content)
            payload = body_content
            
    except Exception as e:
        return {"status": "error", "message": f"Failed to fetch from collection API: {e}"}
        
    if payload.get("status") != "complete":
        return {"status": "error", "message": f"Scrape job is not complete yet. Current status: {payload.get('status')}"}

    articles = payload.get("articles", [])
    
    if isinstance(articles, str):
        try:
            articles = json.loads(articles)
        except Exception:
            articles = []
            
    if not articles:
        return {"status": "success", "message": "No articles found in the scraped data."}

    # TODO remove line when async is added sprint 3
    articles = articles[:10]
    processed_data = []
    skipped_count = 0

    for article in articles:
        if isinstance(article, str):
            print(f"Skipping invalid article format: {article}")
            skipped_count += 1
            continue
            
        file_key = article.get("file_key")
        text_content = article.get("content", "")
        metadata = article.get("metadata", {})
        
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except Exception:
                metadata = {}

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

    bulk_s3_key = None
    if processed_data:
        try:
            # For Communal CEIMS article Archive - Check if this is a CEIMS job from frontend
            is_ceims = params.get("is_ceims", False) if params else False
            
            if is_ceims:
                ceims_s3_key = "public/ceims/all_processed_articles.json"
                existing_data = []
                
                # Attempt to download the existing public file
                try:
                    existing_obj = s3.get_object(Bucket=config.S3_BUCKET_NAME, Key=ceims_s3_key)
                    existing_data = json.loads(existing_obj['Body'].read().decode('utf-8'))
                except Exception:
                    print("No existing CEIMS master file found. Creating a new one.")
                
                # Append new articles
                existing_data.extend(processed_data)
                
                # Filter out duplicate articles
                unique_data = {item['object_id']: item for item in existing_data}.values()
                
                final_json_data = json.dumps(list(unique_data), indent=4)
                bulk_s3_key = ceims_s3_key
                
            else:
                # Private User Data (London, Tokyo, etc.)
                final_json_data = json.dumps(processed_data, indent=4)
                bulk_s3_key = f"users/{user_id}/processed_intelligence/{job_id}_processed.json"
            
            # Upload the file to the chosen path
            s3.put_object(
                Bucket=config.S3_BUCKET_NAME,
                Key=bulk_s3_key,
                Body=final_json_data,
                ContentType='application/json'
            )
            print(f"Uploaded analysis to: {bulk_s3_key}")
            
        except Exception as e:
            print(f"S3 Upload failed: {e}")

    return {
        "status": "success", 
        "processed": len(processed_data), 
        "skipped": skipped_count,
        "s3_key": bulk_s3_key
    }

@tracer.capture_method
def fetch_processed_data(job_id: str, user_id: str = "guest_user"):
    bulk_s3_key = f"users/{user_id}/processed_intelligence/{job_id}_processed.json"
    
    try:
        response = s3.get_object(Bucket=config.S3_BUCKET_NAME, Key=bulk_s3_key)
        return json.loads(response['Body'].read().decode('utf-8'))
    except s3.exceptions.NoSuchKey:
        return {"error": "Processed data not found for this job."}
    except Exception as e:
        raise Exception(f"S3 Read Error: {str(e)}")