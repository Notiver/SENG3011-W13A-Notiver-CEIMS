import json
import sys
from app import config

print("Loading JSON Suburb data...")
try:
    with open(config.LGA_JSON_PATH, 'r') as file:
        suburb_data = json.load(file)
except FileNotFoundError:
    print(f"Error: Could not find JSON LGA data at {config.LGA_JSON_PATH}")
    sys.exit(1)

sorted_suburbs = sorted(suburb_data.keys(), key=len, reverse=True)

def get_location_metadata(text):
    text_lower = text.lower()
    for suburb_name in sorted_suburbs:
        if f" {suburb_name.lower()} " in f" {text_lower} ":            
            suburb_info = suburb_data[suburb_name]
            return {
                "suburb": suburb_name.title(),
                "lga": suburb_info.get("councilname", "Unknown LGA").title(),
                "postcode": str(suburb_info.get("postcode", "0000")) 
            }
    return {"suburb": "NSW General", "lga": "Unknown", "postcode": "0000"}