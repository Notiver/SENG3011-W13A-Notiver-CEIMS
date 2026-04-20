from fastapi import APIRouter, HTTPException, Request
from observability.middleware.logging_middleware import log_spam_event
import json
import boto3
import base64
from pydantic import BaseModel
from app import config 
from app.services.processor_v2 import fetch_processed_data

router = APIRouter(prefix="/data-processing")

class ScrapeRequest(BaseModel):
    location: str
    timeFrame: str
    category: str

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


@router.get("/", include_in_schema=False)
def root():
    return {
        "message": "Data Processing Service is running",
        "target_bucket": config.S3_BUCKET_NAME,
        "region": config.REGION
    }

@router.get("/public/ceims-articles", include_in_schema=False)
def serve_public_ceims_data():
    s3 = boto3.client('s3', region_name=config.REGION if hasattr(config, 'REGION') else "ap-southeast-2")
    ceims_s3_key = "public/ceims/all_processed_articles.json"
    
    try:
        response = s3.get_object(Bucket=config.S3_BUCKET_NAME, Key=ceims_s3_key)
        return json.loads(response['Body'].read().decode('utf-8'))
    except s3.exceptions.NoSuchKey:
        return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read public data: {str(e)}")

@router.post("/process-articles/{job_id}", summary="Trigger NLP Sentiment Analysis")
async def process_articles(job_id: str, request: Request, is_ceims: bool = False):
    """
    Triggers the Hugging Face RoBERTa NLP model to analyze scraped articles.

    Once the data collection job is complete, pass the `job_id` to this endpoint to begin sentiment and risk extraction. 
    This is an asynchronous operation handled by a background AWS worker (SQS -> Lambda).

    - **job_id**: The UUID of the completed scraping job (passed in the path).
    - **is_ceims**: (Query Parameter) Boolean flag. Set to `false` for global locations (e.g., Dubai, London). Set to `true` to enable regional NSW crime categorization.
    
    **Returns:**
    A confirmation that the job has been queued. Proceed to poll the `GET` endpoint for the final results.
    """
    caller_ip = request.client.host if request.client else "unknown"
    user_id = get_user_id(request)
    auth_header = request.headers.get("Authorization")
    
    try:
        sqs_client = boto3.client('sqs', region_name=getattr(config, 'REGION', "ap-southeast-2"))
        
        # Package the details
        message_body = {
            "job_id": job_id,
            "user_id": user_id,
            "auth_header": auth_header,
            "is_ceims": is_ceims
        }
        
        # Send to the queue
        sqs_client.send_message(
            QueueUrl=config.NLP_SQS_QUEUE_URL,
            MessageBody=json.dumps(message_body)
        )
        
        return {
            "status": "processing", 
            "message": "NLP Analysis queued in background.",
            "job_id": job_id
        }
        
    except Exception as e:
        log_spam_event(caller_ip, "processing failure", f"/process-articles/{job_id}")
        raise HTTPException(status_code=500, detail=f"Failed to queue processing job: {str(e)}")

@router.get("/processed-articles/{job_id}", summary="Retrieve NLP Intelligence Results")
async def get_processed_articles(job_id: str, request: Request):
    """
    Polls the AWS S3 data lake for completed NLP inference results.

    Pass the `job_id` here after triggering the processing endpoint.
    
    **Integration Note:**
    - If the AI is still processing, this endpoint may return a `404` or an error indicating the file is not found (continue polling).
    - Once complete, it returns the final JSON intelligence array containing article URLs, metadata, and the aggregated `sentiment_score` (Risk Signal).
    """
    user_id = get_user_id(request)
    
    try:
        data = fetch_processed_data(job_id=job_id, user_id=user_id)
            
        return data
    except Exception as e:
        print(f"Error in get_processed_articles for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"S3 Retrieval Error: {str(e)}")