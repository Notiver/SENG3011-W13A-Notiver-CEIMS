import os
from app.utils.fetch_urls import get_random_monthly_articles
from app.utils.article_scraper import process_articles

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
URL_FILE_PATH = os.path.join(BASE_DIR, "..", "..", "guardian_crime_urls.txt")

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
    return {"status": "success", "message": "System is ready for collection."}