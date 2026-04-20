import io
import os
import json
import base64
import boto3
import uuid
import botocore

from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from pydantic import BaseModel
from app.services.process_excel import process_data
from app.database.s3 import upload_fileobj_to_s3, collect_data_url
from app import config
from observability.middleware.logging_middleware import log_storage_event, log_spam_event
from app.services.article_manager import execute_full_collection, fetch_collection_status

router = APIRouter(prefix="/data-collection")
SQS_QUEUE_URL = os.getenv("SQS_QUEUE_URL")

def get_user_id(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or "Bearer " not in auth_header:
        return "guest_user"
    try:
        token = auth_header.split(" ")[1]
        payload_part = token.split(".")[1]
        decoded_payload = base64.b64decode(payload_part + "==").decode("utf-8")
        payload_json = json.loads(decoded_payload)
        return payload_json.get("username") or payload_json.get("sub") or "guest_user"
    except Exception:
        return "guest_user"

# Interface type for scraper param
class ScrapeRequest(BaseModel):
    location: str
    timeFrame: str
    category: str

@router.get("/", include_in_schema=False)
def root():
    return {"message": "Welcome to Notiver's homepage!"}

@router.post("/upload-data", include_in_schema=False)
def upload_data(request: Request, my_file: UploadFile = File(...)):
    # ... (Internal Excel uploading logic)
    caller_ip = request.client.host if request.client else "unknown"

    log_storage_event(
        caller_ip,
        my_file.filename,
        my_file.size or 0,
        config.S3_BUCKET_NAME,
        "data upload attempt"
    )

    try:
        json_data = process_data(my_file)
        buffer = io.BytesIO(json_data.encode('utf-8'))
        file_name = config.EXCEL_BUCKET_NAME + "/" + config.EXCEL_FILE_NAME
        upload_fileobj_to_s3(buffer, config.S3_BUCKET_NAME, file_name)

        log_storage_event(
            caller_ip,
            my_file.filename,
            my_file.size or 0,
            config.S3_BUCKET_NAME,
            "data upload success"
        )
        return { "message": f"File '{file_name}' processed and uploaded successfully!" }
    except Exception as e:
        log_storage_event(
            caller_ip,
            my_file.filename,
            my_file.size or 0,
            config.S3_BUCKET_NAME,
            "data upload failed"
        )
        raise HTTPException(status_code=500, detail=f"Error uploading to S3: {e}")

@router.get("/collect-data", include_in_schema=False)
def get_data():
    try:
        file_name = config.EXCEL_BUCKET_NAME + "/" + config.EXCEL_FILE_NAME
        
        s3 = boto3.client('s3', region_name=config.REGION if hasattr(config, 'REGION') else "ap-southeast-2")
        s3.head_object(Bucket=config.S3_BUCKET_NAME, Key=file_name)
        
        url = collect_data_url(config.S3_BUCKET_NAME, file_name)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Error finding file: {e}")

@router.post("/upload-articles", include_in_schema=False)
def post_articles(request: Request):
    caller_ip = request.client.host if request.client else "unknown"
    log_storage_event(
        caller_ip,
        "articles",
        0,
        config.S3_BUCKET_NAME,
        "article upload attempt"
    )

    result = execute_full_collection()
    if result["status"] == "error":
        log_spam_event(caller_ip, result["message"], "/upload-articles")
        raise HTTPException(status_code=500, detail=result["message"])

    log_storage_event(
        caller_ip,
        "articles",
        0,
        config.S3_BUCKET_NAME,
        "article upload success"
    )
    return result

@router.get("/collect-articles", include_in_schema=False)
def get_articles():
    return fetch_collection_status()


@router.post("/collect-articles", summary="Initialize Intelligence Scraper")
def post_dynamic_articles(request: ScrapeRequest, fast_request: Request):
    """
    Triggers an asynchronous background worker to scrape historical news articles.

    This endpoint places a job ticket into the SQS queue. The cloud worker will search the Guardian news API based on the parameters provided.

    - **category**: The news vector to target (e.g., "stocks", "crime", "geopolitics").
    - **location**: The target city or keyword (e.g., "Dubai", "New York").
    - **timeFrame**: How far back to search (e.g., "1_per_month_5_years", "5_per_month_1_year").

    **Returns:**
    A JSON object containing a `job_id` which must be used to poll the completion status via the `GET` endpoint.
    """
    user_id = get_user_id(fast_request) 
    job_id = str(uuid.uuid4())

    if not SQS_QUEUE_URL:
        print("ERROR: SQS_QUEUE_URL environment variable is missing!")
        raise HTTPException(status_code=500, detail="Server configuration error: SQS Queue not linked.")

    job_ticket = {
        "job_id": job_id,
        "user_id": user_id,
        "category": request.category,
        "location": request.location,
        "time_frame": request.timeFrame
    }
    
    try:
        sqs_client = boto3.client('sqs', region_name=config.REGION if hasattr(config, 'REGION') else "ap-southeast-2")
        
        sqs_client.send_message(
            QueueUrl=SQS_QUEUE_URL,
            MessageBody=json.dumps(job_ticket)
        )
        
        return {
            "status": "processing", 
            "job_id": job_id, 
            "message": "Scrape job successfully queued in background."
        }
        
    except Exception as e:
        print(f"Failed to send to SQS: {e}")
        raise HTTPException(status_code=500, detail="Failed to queue scraping job.")
    
@router.get("/collect-articles/{job_id}", summary="Poll Scraper Job Status")
def check_job_status(job_id: str, fast_request: Request):
    """
    Polls the AWS S3 data lake to check if the background scraping worker has finished gathering the articles.

    **Integration Note:**
    - If the job is still running, this endpoint returns a `processing` status.
    - Once complete, it returns a `complete` status along with the array of extracted articles and their real publication dates.

    **Parameters:**
    - **job_id**: The unique UUID returned from the `POST /collect-articles` endpoint.
    """
    user_id = get_user_id(fast_request) 
    
    s3_key = f"users/{user_id}/jobs/{job_id}.json"
    s3_client = boto3.client('s3', region_name=config.REGION if hasattr(config, 'REGION') else "ap-southeast-2")
    
    try:
        response = s3_client.get_object(Bucket=config.S3_BUCKET_NAME, Key=s3_key)
        file_content = response['Body'].read().decode('utf-8')
        articles = json.loads(file_content)
        
        return {
            "status": "complete",
            "job_id": job_id,
            "count": len(articles),
            "articles": articles
        }
        
    except botocore.exceptions.ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            return {"status": "processing", "message": "Still scraping, check back soon!"}
        else:
            raise HTTPException(status_code=500, detail="Error checking S3.")