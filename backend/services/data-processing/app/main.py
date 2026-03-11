import os
import boto3
from transformers import pipeline
from dotenv import load_dotenv

# Load secrets
load_dotenv()
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
S3_REGION = os.getenv("AWS_DEFAULT_REGION")

# 1. Initialise S3 Client
s3 = boto3.client('s3', region_name=S3_REGION)

# 2. Initialise RoBERTa
print("Loading RoBERTa model... (please give me a mintute)")
sentiment_task = pipeline(
    "sentiment-analysis", 
    model="cardiffnlp/twitter-roberta-base-sentiment-latest", 
    top_k=None
)

def process_s3_articles():
    print(f"Scanning S3 Bucket: {S3_BUCKET_NAME} for news articles...")
    response = s3.list_objects_v2(Bucket=S3_BUCKET_NAME, Prefix="news/")
    
    if 'Contents' not in response:
        print("No articles found. Check S3")
        return

    for obj in response['Contents']:
        file_key = obj['Key']
        
        if not file_key.endswith('.txt'): 
            continue

        print(f"\n--- Processing: {file_key} ---")
        
        try:
            # 3. Download the text from S3 into memory
            file_obj = s3.get_object(Bucket=S3_BUCKET_NAME, Key=file_key)
            text_content = file_obj['Body'].read().decode('utf-8')
            
            # 4. Truncate for RoBERTa
            # first 1500 characters, key headline
            truncated_text = text_content[:1500]

            # 5. Run the Inference
            results = sentiment_task(truncated_text)
            
            # Example raw output: [[{'label': 'positive', 'score': 0.01}, {'label': 'negative', 'score': 0.95}...]]
            scores = {res['label']: round(res['score'], 4) for res in results[0]}
            
            print("Sentiment Scale:")
            print(f"  ☠️ Negative Risk: {scores.get('negative', 0)}")
            print(f"  😐 Neutral Fact:  {scores.get('neutral', 0)}")
            print(f"  🥰 Positive:      {scores.get('positive', 0)}")
            
        except Exception as e:
            print(f"Error processing {file_key}: {e}")

if __name__ == "__main__":
    process_s3_articles()



    ## put into JSOn with the following
    ## object_id, source type=news/stats, offence type, sentiment, when, suburb