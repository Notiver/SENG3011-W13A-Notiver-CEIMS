import os
import sys
import boto3
import json
import pandas as pd
from datetime import datetime
from transformers import pipeline

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))

if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from utils.clean_suburbs import clean_suburb_data
from utils.crime_classifier import classify_crime

# 1. Call in helper functions
UTILS_DIR = os.path.join(PARENT_DIR, "utils")
CLEAN_SUBURB_FILE = os.path.join(UTILS_DIR, "nsw_suburbs_cleaned.csv")

S3_BUCKET_NAME = "nsw-crime-data-bucket"
REGION = "ap-southeast-2"
PROFILE_NAME = "notiver"

# 2. Initialise AWS Session
try:
    session = boto3.Session(profile_name=PROFILE_NAME)
    s3 = session.client('s3', region_name=REGION)
except Exception:
    s3 = boto3.client('s3', region_name=REGION)

# 3. Initialise NLP Model for human emotions and severity
print("Loading RoBERTa model...")
sentiment_task = pipeline(
    "sentiment-analysis", 
    model="cardiffnlp/twitter-roberta-base-sentiment-latest", 
    top_k=None
)

# 4. Load the freshly cleaned Suburb Data
print("Loading NSW Suburb data...")
suburbs_df = pd.read_csv(CLEAN_SUBURB_FILE)
suburbs_list = suburbs_df.to_dict('records')

def get_location_metadata(text):
    text_lower = text.lower()
    for item in suburbs_list:
        suburb_name = str(item['suburb']).lower()
        if f" {suburb_name} " in f" {text_lower} ":
            return {
                "suburb": item['suburb'],
                "lga": item['local_goverment_area'],
                "postcode": str(item['postcode'])
            }
    return {"suburb": "NSW General", "lga": "Unknown", "postcode": "0000"}

def process_and_finalize():
    print(f"Scanning S3: {S3_BUCKET_NAME}/news/")
    response = s3.list_objects_v2(Bucket=S3_BUCKET_NAME, Prefix="news/")
    
    if 'Contents' not in response:
        print("No articles found.")
        return

    for obj in response['Contents']:
        file_key = obj['Key']
        if not file_key.endswith('.txt'): continue

        try:
            # Download file and its metadata (date, text, etc.)
            file_obj = s3.get_object(Bucket=S3_BUCKET_NAME, Key=file_key)
            text_content = file_obj['Body'].read().decode('utf-8')
            metadata = file_obj.get('Metadata', {})
            article_date = metadata.get('publish_date', datetime.now().isoformat())
            
            # NLP Sentiment Analysis
            sentiment_results = sentiment_task(text_content[:1500])
            scores = {res['label']: round(res['score'], 4) for res in sentiment_results[0]}
            negative_severity = scores.get('negative', 0)

            # Location Matching AND Crime Classification
            loc = get_location_metadata(text_content)
            offence = classify_crime(text_content)
            
            base_id = file_key.split('/')[-1].replace('.txt', '')
            output_json = {
                "object_id": base_id,
                "source_type": "news",
                "offence_type": offence,
                "severity_score": negative_severity,
                "when": article_date,
                "suburb": loc['suburb'],
                "lga": loc['lga'],
                "postcode": loc['postcode']
            }

            # Convert dictionary to JSON string
            json_data = json.dumps(output_json, indent=4)
            
            new_s3_key = f"nlp_processed/{base_id}.json"
            
            # Upload the JSON file to S3
            s3.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=new_s3_key,
                Body=json_data,
                ContentType='application/json'
            )
            
            print(f"Successfully processed and uploaded: s3://{S3_BUCKET_NAME}/{new_s3_key}")
            
        except Exception as e:
            print(f"Error processing {file_key}: {e}")

if __name__ == "__main__":
    process_and_finalize()