import json
import os

# This dynamically finds the absolute path to the 'utils' folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
data_file = os.path.join(BASE_DIR, "SUBURB_TO_LGA_DATA.json")

with open(data_file, 'r') as file:
    suburb_data = json.load(file)

def suburb_to_lga(suburb_name):
    suburb_name = suburb_name.strip().upper()
    lga = suburb_data.get(suburb_name, {}).get("councilname", "LGA not found")
    return lga.title()
