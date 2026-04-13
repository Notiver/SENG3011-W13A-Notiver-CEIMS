import boto3
from app import config
from app.services.retriever import process_retrieval

def get_real_dynamodb():
    """Initializes a REAL connection to your AWS DynamoDB."""
    try:
        # Tries to use your local AWS profile first
        session = boto3.Session(profile_name=getattr(config, 'PROFILE_NAME', 'default'))
        return session.resource('dynamodb', region_name=getattr(config, 'REGION', 'ap-southeast-2'))
    except Exception as e:
        print(f"Falling back to default boto3 credentials: {e}")
        return boto3.resource('dynamodb', region_name=getattr(config, 'REGION', 'ap-southeast-2'))

def seed_databases():
    print("🌍 Connecting to Live AWS DynamoDB...")
    dynamodb = get_real_dynamodb()
    
    # The two environments you want to populate
    stages = ["staging", "production"]
    
    for stage in stages:
        print(f"\n🚀 Starting data retrieval for stage: {stage.upper()}")
        print(f"   Targeting tables: lga-overall-{stage} & lga-by-year-{stage}")
        
        try:
            # We inject the real DB and the specific stage into your pipeline!
            process_retrieval(dynamodb_resource=dynamodb, stage=stage)
            print(f"✅ Successfully populated {stage} tables!")
        except Exception as e:
            print(f"❌ Pipeline crashed for {stage}: {str(e)}")

    print("\n🎉 All database populations complete!")

if __name__ == "__main__":
    seed_databases()