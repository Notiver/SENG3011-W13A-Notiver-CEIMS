import sys
import os
import requests
import time
import json
# 1. Manually add the data-retrieval folder to Python's radar
sys.path.append(os.path.abspath("./backend/services/data-retrieval"))

# 2. Now you can import 'utils' directly, as if you were already inside the folder!
from utils.lga_format_dict import LGA_FORMAT_MAP

# Change this to your deployed API Gateway URL if you are running this against production
API_URL = "http://127.0.0.1:8002/data-processing" 

def seed_lgas():
    # 1. Load your existing suburb JSON file
    json_path = "backend/services/data-retrieval/utils/SUBURB_TO_LGA_DATA.json"
    try:
        with open(json_path, "r") as f:
            suburb_data = json.load(f)
    except FileNotFoundError:
        print(f"Could not find JSON at {json_path}. Are you in the root folder?")
        return

    # 2. Reverse the dictionary (Group suburbs by LGA)
    lga_to_suburbs = {}
    for suburb, data in suburb_data.items():
        lga = data.get("councilname", "LGA not found").title()
        if lga != "Lga Not Found":
            if lga not in lga_to_suburbs:
                lga_to_suburbs[lga] = []
            lga_to_suburbs[lga].append(suburb.title())

    print(f"Starting scraping job for {len(lga_to_suburbs)} LGAs...")
    
    # 3. Scrape using the Suburb name, not the LGA name!
    # for lga, suburbs in lga_to_suburbs.items():
        # Grab the very first suburb in the LGA's list to use as our search target
    # target_suburb = suburbs[0] 
    
    # print(f"Scraping LGA: {lga} | Searching for Suburb: {target_suburb}...")
    
    payload = {
        "location": f"Sydney, Australia",
        "timeFrame": "5_per_month_1_year", 
        "category": "crime"
    }
    
    try:
        response = requests.post(f"{API_URL}/process-articles", json=payload)
        
        if response.status_code == 200:
            print(f"✅ Success: {response.json().get('details')}")
        else:
            print(f"❌ Failed {target_suburb}: {response.text}")
            
    except Exception as e:
        print(f"🚨 Connection error for {target_suburb}: {e}")
            
        # Sleep to avoid rate-limiting the news scraper
        # time.sleep(2)

    print("\n🎉 All LGAs seeded with suburb data!")

if __name__ == "__main__":
    seed_lgas()