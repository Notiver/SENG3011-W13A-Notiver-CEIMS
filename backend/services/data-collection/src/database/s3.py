import boto3
import config as config
# from dotenv import load_dotenv

# load_dotenv()

# def get_s3_client():
#     session = boto3.Session(profile_name=settings.AWS_PROFILE_NAME)
#     return session.client('s3', region_name=settings.AWS_DEFAULT_REGION)

def upload_fileobj_to_s3(file_obj, bucket_name, s3_key):
    """Uploads a file-like object directly to an S3 object."""
    # s3 = get_s3_client()
    s3 = boto3.client('s3')

    try:
        s3.upload_fileobj(file_obj, bucket_name, s3_key)
        print(f"Successfully uploaded: s3://{bucket_name}/{s3_key}")
    except Exception as e:
        print(f"Error uploading to S3: {e}")

def collect_data(bucket_name, s3_key):
    """Returns the raw S3 response body stream."""
    s3 = boto3.client('s3')
    response = s3.get_object(Bucket=bucket_name, Key=s3_key)
    return response['Body'], response.get('ContentType', 'application/json')