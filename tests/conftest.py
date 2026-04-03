
import boto3
import pytest

from util_config import TIMEOUT

@pytest.fixture(scope="module")
def s3():
    return boto3.client("s3", region_name="ap-southeast-2")

# === helpers ===

def wait_for_s3_object(s3, bucket, key):
    '''waits for uploads to s3'''
    waiter = s3.get_waiter('object_exists')
    try:
        # Defaults to checking every 5 seconds, 20 times.
        # You can customize these via Delay and MaxAttempts.
        waiter.wait(Bucket=bucket, Key=key, \
                    WaiterConfig={'Delay': 1, 'MaxAttempts': TIMEOUT})
        return True
    except Exception as e:
        print(f"Timed out or error: {e}")
        return False

# def get_user_id_from_token(token):
#     # Decode the payload without verifying the signature
#     # (Safe for local test scripts where you already trust the source)
#     decoded = jwt.decode(token, options={"verify_signature": False})
#     return decoded.get("sub")
