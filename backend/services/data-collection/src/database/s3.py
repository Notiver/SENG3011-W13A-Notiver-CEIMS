from src.config import settings
import boto3
# from dotenv import load_dotenv

# load_dotenv()

def get_s3_client():
    session = boto3.Session(profile_name=settings.AWS_PROFILE_NAME)
    return session.client('s3', region_name=settings.AWS_DEFAULT_REGION)

def upload_to_s3(text_content, s3_key):
    """Uploads string content directly to an S3 object."""
    s3 = get_s3_client()
    try:
        s3.put_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key, Body=text_content)
        print(f"Successfully uploaded: s3://{settings.S3_BUCKET_NAME}/{s3_key}")
    except Exception as e:
        print(f"Error uploading to S3: {e}")