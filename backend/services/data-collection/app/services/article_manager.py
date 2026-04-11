# import os
from app.utils.fetch_urls import get_random_monthly_articles
from app.utils.article_scraper import process_articles
from app.database.s3 import fetch_all_articles
from aws_lambda_powertools import Tracer
from app import config

URL_FILE_PATH = "/tmp/guardian_crime_urls.txt"

# # for local testing: 
# BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# URL_FILE_PATH = os.path.join(BASE_DIR, "..", "..", "guardian_crime_urls.txt")
tracer = Tracer(service="data-collection")

@tracer.capture_method
def execute_full_collection():
    try:
        # Get URLs + save them to the text file
        get_random_monthly_articles(2021, 2025, filename=URL_FILE_PATH)
        
        # Read text file, scrape Newspaper4k, process
        process_articles(file_path=URL_FILE_PATH)
        return {"status": "success", "message": "Articles collected and processed successfully."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def fetch_collection_status():
    """Returns all collected articles as a JSON payload."""
    prefix = f"{config.NEWS_BUCKET_NAME}/"
    articles = fetch_all_articles(config.S3_BUCKET_NAME, prefix)
    
    return {
        "status": "success", 
        "count": len(articles), 
        "articles": articles
    }
