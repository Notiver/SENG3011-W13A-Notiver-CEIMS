import boto3
from botocore.exceptions import ClientError

def create_bucket(user_id):
    region = 'ap-southeast-2'

    try:
        bucket_config = {}
        s3_client = boto3.client('s3', region_name=region)
        if region != 'us-east-1':
            bucket_config['CreateBucketConfiguration'] = {'LocationConstraint': region}

        s3_client.create_bucket(Bucket=f"notiver-CEIMS-{user_id}", **bucket_config)
    except ClientError as e:
        print(f"Error creating s3 bucket: {e}")
