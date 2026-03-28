import io
from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from app.services.process_excel import process_data
from app.database.s3 import upload_fileobj_to_s3, collect_data_url
from app import config
from app.services.article_manager import execute_full_collection, fetch_collection_status
from observability.middleware.logging_middleware import log_storage_event, log_spam_event

router = APIRouter()

@router.get("/")
def root():
    return {"message": "Welcome to Notiver's homepage!"}

@router.post("/upload-data")
def upload_data(request: Request, my_file: UploadFile = File(...)):
    caller_ip = request.client.host if request.client else "unknown"

    log_storage_event(
        caller_ip,
        my_file.filename,
        my_file.size or 0,
        config.S3_BUCKET_NAME,
        "data upload attempt"
    )

    json_data = process_data(my_file)
    buffer = io.BytesIO(json_data.encode('utf-8'))
    file_name = config.EXCEL_BUCKET_NAME + "/" + config.EXCEL_FILE_NAME
    try:
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

@router.get("/collect-data")
def get_data():
    try:
        file_name = config.EXCEL_BUCKET_NAME + "/" + config.EXCEL_FILE_NAME
        url = collect_data_url(config.S3_BUCKET_NAME, file_name)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Error finding file: {e}")

@router.post("/upload-articles")
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

@router.get("/collect-articles")
def get_articles():
    return fetch_collection_status()
