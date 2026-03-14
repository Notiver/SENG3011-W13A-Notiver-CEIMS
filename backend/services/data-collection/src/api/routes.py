from fastapi import APIRouter, UploadFile, File
from services.process_excel import process_data, collect_data
from database.s3 import upload_to_s3
import config as config

router = APIRouter()

@router.get("/")
def root():
    return {"Welcome to Notiver's homepage!"}

@router.post("/upload-data")
def upload_data(my_file: UploadFile = File(...)):
    json_data = process_data(my_file)
    file_name = config.EXCEL_BUCKET_NAME + "/crime_data.json"
    upload_to_s3(json_data, file_name)
    return { "message": f"File '{file_name}' processed and uploaded successfully!" }

@router.get("/collect-data")
def get_data():
    return collect_data()

@router.post("/upload-articles")
def post_articles():
    return {"data": "Data created successfully!"}

@router.get("/collect-articles")
def get_articles():
    return {"data": "Data collected successfully!"}