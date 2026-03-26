import io
from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from pydantic import BaseModel
from app.services.process_excel import process_data
from app.database.s3 import upload_fileobj_to_s3, collect_data_url
from app import config
from app.services.article_manager import execute_full_collection, fetch_collection_status
from app.services.scraper_v2 import run_dynamic_scraper
import json
import base64

router = APIRouter()

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


@router.get("/")
def root():
    return {"message": "Welcome to Notiver's homepage!"}

@router.post("/upload-data")
def upload_data(my_file: UploadFile = File(...)):
    json_data = process_data(my_file)
    buffer = io.BytesIO(json_data.encode('utf-8'))
    file_name = config.EXCEL_BUCKET_NAME + "/" + config.EXCEL_FILE_NAME
    try:
        upload_fileobj_to_s3(buffer, config.S3_BUCKET_NAME, file_name)
        return { "message": f"File '{file_name}' processed and uploaded successfully!" }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading to S3: {e}")

@router.get("/collect-data")
def get_data():
    try:
        file_name = config.EXCEL_BUCKET_NAME + "/" + config.EXCEL_FILE_NAME
        url = collect_data_url(config.S3_BUCKET_NAME, file_name)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Error finding file: {e}")

@router.post("/upload-articles")
def post_articles():
    result = execute_full_collection()
    if result["status"] == "error":
         raise HTTPException(status_code=500, detail=result["message"])
    return result

@router.get("/collect-articles")
def get_articles():
    return fetch_collection_status()

@router.post("/collect-articles")
def post_dynamic_articles(request: ScrapeRequest, fast_request: Request):
    user_id = get_user_id(fast_request) 
    
    try:
        results = run_dynamic_scraper(
            location=request.location,
            time_frame=request.timeFrame,
            category=request.category,
            user_id=user_id
        )
        
        return {
            "status": "success", 
            "user_id": user_id, 
            "count": len(results), 
            "articles": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))