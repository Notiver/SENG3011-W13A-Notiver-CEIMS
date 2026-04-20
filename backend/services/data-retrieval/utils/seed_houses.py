import os
import glob
import boto3
import json
from decimal import Decimal
from collections import defaultdict

# --- 1. Suburb to LGA Mapping Logic ---
with open("SUBURB_TO_LGA_DATA.json", 'r') as file:
    suburb_data = json.load(file)

def suburb_to_lga(suburb_name):
    suburb_name = suburb_name.strip().upper()
    lga = suburb_data.get(suburb_name, {}).get("councilname", "LGA Not Found")
    return lga.title()

# --- 2. Math Logic ---
NSW_MEAN_PRICE = 1301100

def calculate_housing_score(lga_mean_price):
    """
    Calculates a score from 1-100 based on deviation from the NSW mean.
    Uses an exponential decay curve to prevent bunching at 100 or 0.
    """
    if lga_mean_price <= 0:
        return 100.0
        
    # Mathematical Logic: 100 * (0.5 ^ (Price / Mean))
    # This naturally bounds everything between 0 and 100 without hard clamping!
    ratio = lga_mean_price / NSW_MEAN_PRICE
    score = 100 * (0.5 ** ratio)
    
    return max(1.0, min(100.0, score))

# --- 3. Core Processing Pipeline ---
def process_local_dat_files(directory_path, stage="staging"):
    print(f"Connecting to DynamoDB table: lga-housing-{stage}...")
    
    # Initialize boto3. Make sure you have your AWS CLI credentials configured locally!
    session = boto3.Session() 
    dynamodb = session.resource('dynamodb', region_name="ap-southeast-2") # Update region if needed
    table = dynamodb.Table(f'lga-housing-{stage}')

    lga_prices = defaultdict(list)

    # Find all .DAT or .dat files in the specified folder
    dat_files = glob.glob(os.path.join(directory_path, "*.DAT")) + glob.glob(os.path.join(directory_path, "*.dat"))
    print(f"Found {len(dat_files)} DAT files. Extracting residential sales...")

    # Loop through every file and every line
    for file_path in dat_files:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if line.startswith("B;"):
                    parts = line.split(";")
                    
                    # Ensure the row has enough columns
                    if len(parts) > 18:
                        suburb = parts[9].strip()
                        price_str = parts[15].strip()
                        prop_type = parts[18].strip()

                        # Filter out Commercial, Office, Industrial, etc.
                        if prop_type != "RESIDENCE":
                            continue

                        # Ensure there is an actual price attached
                        if price_str.isdigit():
                            price = float(price_str)
                            lga = suburb_to_lga(suburb)

                            if lga != "Lga Not Found" and lga != "LGA Not Found":
                                lga_prices[lga].append(price)

    print(f"Extraction complete. Found data for {len(lga_prices)} LGAs. Aggregating...")

    final_housing_data = []
    
    # Calculate the mean price and stat score for each LGA
    for lga, prices in lga_prices.items():
        if len(prices) == 0:
            continue
            
        mean_price = sum(prices) / len(prices)
        stat_score = calculate_housing_score(mean_price)

        final_housing_data.append({
            "lga": lga,
            "mean_price": Decimal(str(round(mean_price, 2))),
            "statistical_score": Decimal(str(round(stat_score, 2))),
            # We seed sentiment with 0.5 until your NLP pipeline overrides it later
            "sentiment_score": Decimal("0.5") 
        })

    # Upload to AWS DynamoDB in batches of 25 (DynamoDB handles the batching automatically here)
    print("Uploading data to DynamoDB...")
    with table.batch_writer() as writer:
        for item in final_housing_data:
            writer.put_item(Item=item)

    print("Upload complete! Your database is now populated with real NSW housing data.")

if __name__ == "__main__":
    # Specify the folder where you saved all your Valuer General .DAT files
    DAT_FOLDER_PATH = "./dats" 
    
    # Run it! Change "staging" to "production" when you are ready for the real deal.
    process_local_dat_files(DAT_FOLDER_PATH, stage="staging")