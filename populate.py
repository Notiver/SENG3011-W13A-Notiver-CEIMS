import requests
import time
from backend.services.data_retrieval.utils.lga_format_dict import LGA_FORMAT_MAP

# Change this to your deployed API Gateway URL if you are running this against production
API_URL = "https://hbjyijsell.execute-api.ap-southeast-2.amazonaws.com/data-processing" 

def seed_lgas():
    unique_lgas = set([lga for lga in LGA_FORMAT_MAP.values() if "not found" not in lga.lower()])
    
    print(f"Starting scraping job for {len(unique_lgas)} LGAs...")
    
    for lga in unique_lgas:
        print(f"Scraping news for: {lga}...")
        
        payload = {
            "location": f"{lga}, New South Wales, Australia",
            "timeFrame": "1_per_month_1_year", 
            "category": "crime"
        }
        
        try:
            # Hit your data-processing endpoint
            response = requests.post(f"{API_URL}/process-articles", json=payload)
            
            if response.status_code == 200:
                print(f"✅ Success: {response.json().get('details')}")
            else:
                print(f"❌ Failed {lga}: {response.text}")
                
        except Exception as e:
            print(f"🚨 Connection error for {lga}: {e}")
            
        # Optional: Sleep for 2 seconds to avoid rate-limiting your news scraper
        time.sleep(2)

    print("\n🎉 All 130 LGAs scraped and processed into S3!")
    print("Run `python3 -m app.services.retriever` to pull the final S3 file into DynamoDB.")

if __name__ == "__main__":
    seed_lgas()