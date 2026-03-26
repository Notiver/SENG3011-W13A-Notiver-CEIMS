from fastapi import APIRouter, HTTPException, Request
import boto3
import json
import base64
from pydantic import BaseModel
from . import config 
from app.services.processor import run_nlp_pipeline

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

@router.post("/process-articles")
async def process_articles(request_data: ScrapeRequest, request: Request):
    user_id = get_user_id(request)
    
    try:
        result = run_nlp_pipeline(params=request_data.model_dump(), user_id=user_id)
        
        return {
            "status": "success", 
            "message": f"NLP Analysis complete for user: {user_id}",
            "output_folder": f"users/{user_id}/{config.NLP_BUCKET_NAME}",
            "details": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@router.get("/processed-articles")
async def get_processed_articles(request: Request):
    user_id = get_user_id(request)
    
    try:
        session = boto3.Session(region_name=config.REGION)
        s3 = session.client('s3')
        
        user_prefix = f"users/{user_id}/{config.NEWS_BUCKET_NAME}/"
        
        response = s3.list_objects_v2(
            Bucket=config.S3_BUCKET_NAME, 
            Prefix=user_prefix
        )
        
        articles = []
        if 'Contents' in response:
            for obj in response['Contents']:
                if obj['Key'] == user_prefix:
                    continue
                    
                file_obj = s3.get_object(Bucket=config.S3_BUCKET_NAME, Key=obj['Key'])
                text = file_obj['Body'].read().decode('utf-8')
                
                articles.append({
                    "file_key": obj['Key'],
                    "content": text,
                    "metadata": {
                        "publish_date": obj['LastModified'].isoformat(),
                        "size": obj['Size']
                    }
                })
        
        return {
            "status": "success", 
            "user_id": user_id,
            "count": len(articles),
            "articles": articles
        }
    except Exception as e:
        print(f"Error in get_processed_articles for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"S3 Retrieval Error: {str(e)}")