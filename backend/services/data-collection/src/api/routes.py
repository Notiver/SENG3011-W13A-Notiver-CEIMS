from fastapi import APIRouter, UploadFile, File
from services.process_excel import process_excel
import config as config

router = APIRouter()

# for database
# s3_client = boto3.client('s3')
# BUCKET_NAME = "your-data-lake-bucket"

@router.get("/")
def root():
    return {"Welcome to Notiver's homepage!"}

@router.post("/process-data")
def post_data(my_file: UploadFile = File(...)):
    return process_excel(my_file)

@router.post("/process-news")
def post_news():
    return {"data": "Data created successfully!"}