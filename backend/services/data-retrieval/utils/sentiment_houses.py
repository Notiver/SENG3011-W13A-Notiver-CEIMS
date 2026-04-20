import json
import time
import requests
import newspaper
import boto3
from decimal import Decimal
from collections import defaultdict
from transformers import pipeline

# --- Configuration ---
STAGE = "staging"  # Change to "production" when ready
GUARDIAN_API_KEY = "test"
TABLE_NAME = f'lga-housing-{STAGE}'

def copy_sentiment_to_production():
    print("Connecting to AWS DynamoDB...")
    
    # Initialize boto3 using your local AWS credentials
    session = boto3.Session()
    dynamodb = session.resource('dynamodb', region_name="ap-southeast-2")
    
    staging_table = dynamodb.Table('lga-housing-staging')
    prod_table = dynamodb.Table('lga-housing-production')
    
    print("Scanning staging table for sentiment scores...")
    
    # 1. Scan the entire staging table
    # We use a while loop to handle pagination just in case AWS splits the response
    response = staging_table.scan()
    items = response.get('Items', [])
    
    while 'LastEvaluatedKey' in response:
        response = staging_table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        items.extend(response.get('Items', []))
        
    print(f"Found {len(items)} LGAs in staging. Syncing to production...")
    
    success_count = 0
    
    # 2. Loop through and update production
    for item in items:
        lga = item.get('lga')
        sentiment = item.get('sentiment_score')
        
        if not lga or sentiment is None:
            continue
            
        try:
            # We use update_item so we don't accidentally erase production's housing prices!
            prod_table.update_item(
                Key={'lga': lga},
                UpdateExpression="SET sentiment_score = :val",
                ExpressionAttributeValues={
                    ':val': Decimal(str(sentiment))
                }
            )
            success_count += 1
            
        except Exception as e:
            print(f"Failed to update {lga} in production: {e}")
            
    print(f"\n✅ Success! Copied {success_count} sentiment scores to production.")

def get_lga_to_suburbs_map():
    """
    Inverts your JSON file. 
    Returns a dictionary where Keys = LGAs, Values = List of Suburbs in that LGA.
    """
    with open("SUBURB_TO_LGA_DATA.json", 'r') as file:
        suburb_data = json.load(file)
    
    lga_to_suburbs = defaultdict(list)
    for suburb, data in suburb_data.items():
        lga = data.get("councilname")
        if lga:
            lga_to_suburbs[lga.title()].append(suburb.title())
            
    return lga_to_suburbs

def run_local_housing_nlp():
    print(f"Connecting to DynamoDB table: {TABLE_NAME}...")
    session = boto3.Session()
    dynamodb = session.resource('dynamodb', region_name="ap-southeast-2")
    table = dynamodb.Table(TABLE_NAME)

    print("Loading RoBERTa sentiment model (this might take a few seconds)...")
    sentiment_task = pipeline(
        "sentiment-analysis", 
        model="cardiffnlp/twitter-roberta-base-sentiment-latest", 
        top_k=None
    )

    lga_map = get_lga_to_suburbs_map()
    print(f"Found {len(lga_map)} unique LGAs to process.")

    url = "https://content.guardianapis.com/search"

    for lga, suburbs in lga_map.items():
        print(f"\n--- Processing LGA: {lga} ---")
        
        # 1. Grab up to 5 suburbs for this LGA to build the search query
        # (We limit to 5 so the URL doesn't get too long and crash the request)
        target_suburbs = suburbs[:5]
        suburb_query_string = " OR ".join([f'"{sub}"' for sub in target_suburbs])
        
        # Query looks like: ("Manly" OR "Dee Why") AND (housing OR property...)
        query = f'({suburb_query_string}) AND (housing OR "real estate" OR property OR rent)'
        
        params = {
            "q": query,
            "section": "australia-news",
            "page-size": 3, # Fetch top 3 articles per LGA grouping
            "api-key": GUARDIAN_API_KEY,
            "order-by": "relevance"
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            results = response.json().get("response", {}).get("results", [])
            
            if not results:
                print(f"No housing articles found for {target_suburbs}. Skipping.")
                time.sleep(1)
                continue
                
            lga_sentiments = []
            
            # 2. Download and Analyze the text
            for item in results:
                article_url = item.get('webUrl')
                try:
                    article = newspaper.article(article_url)
                    article.download()
                    article.parse()
                    text_content = article.text
                    
                    if text_content:
                        # Run RoBERTa on the first 1500 characters
                        sentiment_results = sentiment_task(text_content[:1500])
                        scores = {res['label'].lower(): round(res['score'], 4) for res in sentiment_results[0]} 
                        
                        # Positive score = Thriving housing market
                        pos_score = scores.get('positive', 0.5) 
                        lga_sentiments.append(pos_score)
                        print(f"Scored {pos_score} -> {article_url}")
                        
                except Exception as e:
                    print(f"Failed to scrape article: {e}")
            
            # 3. Update DynamoDB with the average sentiment for the LGA
            if lga_sentiments:
                avg_sentiment = sum(lga_sentiments) / len(lga_sentiments)
                
                table.update_item(
                    Key={'lga': lga},
                    UpdateExpression="SET sentiment_score = :val",
                    ExpressionAttributeValues={
                        ':val': Decimal(str(round(avg_sentiment, 2)))
                    }
                )
                print(f"✅ Updated {lga} in DB with sentiment: {round(avg_sentiment, 2)}")
                
        except Exception as e:
            print(f"Failed to fetch from Guardian for {lga}: {e}")
            
        # Keep The Guardian API happy
        time.sleep(1)

    print("\n🎉 Local Housing NLP Pipeline Complete!")

def run_s3_housing_nlp():
    print("Running local housing NLP (no DynamoDB)...")

    print("Loading RoBERTa sentiment model (this might take a few seconds)...")
    sentiment_task = pipeline(
        "sentiment-analysis", 
        model="cardiffnlp/twitter-roberta-base-sentiment-latest", 
        top_k=None
    )

    lga_map = get_lga_to_suburbs_map()
    print(f"Found {len(lga_map)} unique LGAs to process.")

    url = "https://content.guardianapis.com/search"

    # ✅ Dictionary instead of list
    final_results = {}

    for lga, suburbs in lga_map.items():
        print(f"\n--- Processing LGA: {lga} ---")
        
        target_suburbs = suburbs[:5]
        suburb_query_string = " OR ".join([f'"{sub}"' for sub in target_suburbs])
        
        query = f'({suburb_query_string}) AND (housing OR "real estate" OR property OR rent)'
        
        params = {
            "q": query,
            "section": "australia-news",
            "page-size": 3,
            "api-key": GUARDIAN_API_KEY,
            "order-by": "relevance"
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            results = response.json().get("response", {}).get("results", [])
            
            if not results:
                print(f"No housing articles found for {target_suburbs}. Skipping.")
                time.sleep(1)
                continue
                
            lga_sentiments = []
            
            for item in results:
                article_url = item.get('webUrl')
                try:
                    article = newspaper.article(article_url)
                    article.download()
                    article.parse()
                    text_content = article.text
                    
                    if text_content:
                        sentiment_results = sentiment_task(text_content[:1500])
                        scores = {
                            res['label'].lower(): round(res['score'], 4)
                            for res in sentiment_results[0]
                        }
                        
                        pos_score = scores.get('positive', 0.5)
                        lga_sentiments.append(pos_score)
                        print(f"Scored {pos_score} -> {article_url}")
                        
                except Exception as e:
                    print(f"Failed to scrape article: {e}")
            
            # ✅ Save to dictionary
            if lga_sentiments:
                avg_sentiment = round(sum(lga_sentiments) / len(lga_sentiments), 2)

                final_results[lga] = avg_sentiment

                print(f"✅ Saved {lga}: {avg_sentiment}")
                
        except Exception as e:
            print(f"Failed to fetch from Guardian for {lga}: {e}")
            
        time.sleep(1)

    # ✅ Write JSON file
    with open("housing_sentiment.json", "w") as f:
        json.dump(final_results, f, indent=2)

    print("\n🎉 Saved results to housing_sentiment.json!")

if __name__ == "__main__":
    # run_local_housing_nlp()
    run_s3_housing_nlp()