import json
import boto3
import traceback
from services.scraper_v2 import run_dynamic_scraper
from app import config

s3_client = boto3.client('s3')

# Handles tickets for queuing sytem, allowing for more async scraping
def sqs_handler(event, context):
    for record in event.get('Records', []):
        try:
            payload = json.loads(record['body'])
            job_id = payload['job_id']
            user_id = payload['user_id']
            category = payload['category']
            location = payload['location']
            time_frame = payload['time_frame']
            
            print(f"Starting Background Job: {job_id} | Cat: {category} | Loc: {location}")
            
            scraped_data = run_dynamic_scraper(
                location=location, 
                time_frame=time_frame, 
                category=category, 
                user_id=user_id
            )
            
            result_key = f"users/{user_id}/jobs/{job_id}.json"
            
            s3_client.put_object(
                Bucket=config.S3_BUCKET_NAME,
                Key=result_key,
                Body=json.dumps({
                    "status": "completed", 
                    "job_id": job_id, 
                    "count": len(scraped_data),
                    "articles": scraped_data
                }),
                ContentType='application/json'
            )
            
            print(f"SUCCESS: Job {job_id} complete. Data saved to S3: {result_key}")
            
        except Exception as e:
            print(f"CRITICAL ERROR processing SQS record: {e}")
            print(traceback.format_exc())
            
    return {"statusCode": 200, "body": "Processed all records"}