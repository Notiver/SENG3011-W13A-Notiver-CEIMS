import boto3
import httpx
import time
import pytest
from util_auth import STAGING_JWT

### url config
API_URL = "https://hbjyijsell.execute-api.ap-southeast-2.amazonaws.com/"
COLLECTION_ROUTE = "data-collection"
PROCESSING_ROUTE = "data-processing"
RETRIEVAL_ROUTE = "data-retrieval"

### other config
excel_file_path = "../test_data/LGA_trends.xlsx"
BUCKET = "nsw-crime-data-bucket/"

# === helpers ===
@pytest.fixture(scope="module")
def s3():
    return boto3.client("s3", region_name="ap-southeast-2")

def wait_for_s3_object(s3, bucket, key, timeout=30):
    """Poll S3 until the file appears — async processing needs this."""
    for _ in range(timeout):
        try:
            s3.head_object(Bucket=bucket, Key=key)
            return True
        except:
            time.sleep(1)
    return False

# === e2e tests ===
def test_data_e2e(s3):
    '''e2e test for crime data collection, processing, and retrieval'''
    # data collection - upload
    with open(excel_file_path, "rb") as f:
        response = httpx.post(
            f"{API_URL}/{COLLECTION_ROUTE}/upload-data",
            files={"file": ("LGA_trends.xlsx", f, \
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers={"Authorization": f"Bearer {STAGING_JWT}"}
        )
        assert response.status_code == 200

    # data collection - check for file upload in S3
    excel_file = "boscar/crime_data.xlsx"
    assert wait_for_s3_object(s3, BUCKET, excel_file), \
        "Collection service never wrote to S3"

    # data processing
    response = httpx.post(
        f"{API_URL}/{PROCESSING_ROUTE}/process-data",
        json={
            "location": "Sydney",
            "timeFrame": "1_per_month_1_year",
            "category": "crime"
        },
    )
    assert response.status_code == 200

    # # ── Step 4: Wait for processed data to land in S3 ───────────────────
    # processed_key = "processed/crime_data.json"
    # assert wait_for_s3_object(s3, STAGING_BUCKET, processed_key), \
    #     "Processing service never wrote output to S3"

    # data retrieval
    response = httpx.post(
        f"{API_URL}/{RETRIEVAL_ROUTE}/lgas",
    )
    assert response.status_code == 200
    data = response.json()

    # ── Step 6: Assert the full chain produced correct output ────────────
    assert len(data) > 0
    assert isinstance(data, dict)
    assert "lgas" in data

def test_data_e2e(s3):
    '''e2e test for articles'''