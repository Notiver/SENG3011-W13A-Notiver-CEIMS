import requests
import newspaper
import boto3
import random
import os
from datetime import datetime

# Map the frontend categories to Guardian search keywords
CATEGORY_MAP = {
    "crime": "(police OR crime OR murder OR theft)",
    "housing": "(housing OR real estate OR property prices OR rent)",
    "lifestyle": "(lifestyle OR culture OR events OR community)",
    "jobs": "(jobs OR employment OR economy OR hiring)",
    "stocks": "(stocks OR asx OR finance OR markets)",
    "weather": "(weather OR forecast OR storm OR flood)",
    "geopolitics": "(geopolitics OR foreign policy OR international relations)",
    "climate": "(climate change OR environment OR emissions)"
}

def run_dynamic_scraper(location: str, time_frame: str, category: str):
    print(f"Starting dynamic scrape for: {location}, {category}, {time_frame}")
    
    keywords = CATEGORY_MAP.get(category, category)
    search_query = f'"{location}" AND {keywords}'
    
    current_year = datetime.now().year
    start_year = current_year
    end_year = current_year
    page_size = 1
    
    if time_frame == "1_per_month_5_years":
        start_year = current_year - 4
        page_size = 1
    elif time_frame == "5_per_month_1_year":
        start_year = current_year
        page_size = 5
    elif time_frame == "1_per_day_1_month":
        start_year = current_year
        page_size = 30 
        
    url = "https://content.guardianapis.com/search"
    api_key = os.getenv("GUARDIAN_API_KEY", "test")    
    article_urls = []
    
    # Fetch the URLs
    for year in range(start_year, end_year + 1):
        params = {
            "q": search_query,
            "section": "australia-news",      
            "from-date": f"{year}-01-01",        
            "to-date": f"{year}-12-31",          
            "page-size": page_size,                   
            "api-key": api_key                 
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            if response.status_code == 200:
                results = response.json().get("response", {}).get("results", [])
                for item in results:
                    article_urls.append(item.get('webUrl'))
        except Exception as e:
            print(f"Guardian API Request failed: {e}")

    print(f"Found {len(article_urls)} URLs. Scraping content...")

    # Scrape Text and Upload to S3
    s3 = boto3.client('s3', region_name=os.getenv("AWS_DEFAULT_REGION", "ap-southeast-2"))
    bucket_name = os.getenv("S3_BUCKET_NAME", "your-fallback-bucket-name")
    
    scraped_data = []

    for i, article_url in enumerate(article_urls):
        try:
            article = newspaper.article(article_url)
            article.download()
            article.parse()
            content = article.text
            
            if content:
                safe_cat = category.replace(" ", "_")
                s3_key = f"news/{safe_cat}_{year}_{i}.txt"
                
                # Upload to S3
                s3.put_object(Bucket=bucket_name, Key=s3_key, Body=content)
                
                # Save metadata to return to the frontend
                scraped_data.append({
                    "file_key": s3_key,
                    "url": article_url,
                    "content": content,
                    "metadata": {"publish_date": f"{year}-01-01"}
                })
        except Exception as e:
            print(f"Failed to process {article_url}: {e}")

    return scraped_data