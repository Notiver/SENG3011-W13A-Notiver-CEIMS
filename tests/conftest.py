
from time import time

import boto3
import pytest

from util_config import TIMEOUT

@pytest.fixture(scope="module")
def s3():
    return boto3.client("s3", region_name="ap-southeast-2")

# === helpers ===

def wait_for_s3_object(s3, bucket, key, timeout=TIMEOUT):
    """Poll S3 until the file appears — async processing needs this."""
    for _ in range(timeout):
        print(".", end="", flush=True)
        try:
            s3.head_object(Bucket=bucket, Key=key)
            return True
        except:
            time.sleep(1)
    return False

# def get_user_id_from_token(token):
#     # Decode the payload without verifying the signature
#     # (Safe for local test scripts where you already trust the source)
#     decoded = jwt.decode(token, options={"verify_signature": False})
#     return decoded.get("sub")
