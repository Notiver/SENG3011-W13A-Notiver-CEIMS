import boto3
import config as config

def upload_fileobj_to_s3(file_obj, bucket_name, s3_key):
    """Uploads a file-like object directly to an S3 object."""
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

def fetch_all_articles(bucket_name, prefix):
    """Fetches all article text files from S3 and returns them as a list of dicts."""
    s3 = boto3.client('s3')
    response = s3.list_objects_v2(Bucket=bucket_name, Prefix=prefix)
    
    articles = []
    if 'Contents' not in response:
        return articles
        
    for obj in response['Contents']:
        file_key = obj['Key']
        if not file_key.endswith('.txt'):
            continue
            
        try:
            file_obj = s3.get_object(Bucket=bucket_name, Key=file_key)
            text_content = file_obj['Body'].read().decode('utf-8')
            metadata = file_obj.get('Metadata', {})
            
            articles.append({
                "file_key": file_key,
                "content": text_content,
                "metadata": metadata
            })
        except Exception as e:
            print(f"Error reading {file_key} from S3: {e}")
            
    return articles