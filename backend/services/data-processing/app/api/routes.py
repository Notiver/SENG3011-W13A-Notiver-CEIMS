from fastapi import APIRouter, HTTPException, Request
from observability.middleware.logging_middleware import log_spam_event
import json
import base64
from pydantic import BaseModel
from app import config 
from app.services.processor_v2 import run_nlp_pipeline, fetch_processed_data
router = APIRouter()

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

@router.get("/")
def root():
    return {
        "message": "Data Processing Service is running",
        "target_bucket": config.S3_BUCKET_NAME,
        "region": config.REGION
    }

@router.post("/process-articles/{job_id}")
async def process_articles(job_id: str, request: Request):
    caller_ip = request.client.host if request.client else "unknown"
    user_id = get_user_id(request)
    
    auth_header = request.headers.get("Authorization")
    
    try:
        result = run_nlp_pipeline(job_id=job_id, user_id=user_id, auth_header=auth_header)
        
        if result.get("status") == "error":
            raise Exception(result.get("message"))
            
        return {
            "status": "success", 
            "message": f"NLP Analysis complete for user: {user_id}",
            "job_id": job_id,
            "details": result
        }
    except Exception as e:
        log_spam_event(caller_ip, "processing failure", f"/process-articles/{job_id}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@router.get("/processed-articles/{job_id}")
async def get_processed_articles(job_id: str, request: Request):
    user_id = get_user_id(request)
    
    try:
        data = fetch_processed_data(job_id=job_id, user_id=user_id)
        
        if "error" in data:
            raise Exception(data["error"])
            
        return data
    except Exception as e:
        print(f"Error in get_processed_articles for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"S3 Retrieval Error: {str(e)}")