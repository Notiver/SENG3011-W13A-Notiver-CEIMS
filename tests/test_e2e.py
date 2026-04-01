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
TEST_BUCKET = "notiver-ceims-dev"

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

def test_full_pipeline_e2e(s3):
    """
    Trigger collection → verify S3 → trigger processing → 
    verify transformed S3 → query retrieval → verify response.
    """

    # ── Step 1: Trigger the Collection Service ──────────────────────────
    with open(excel_file_path, "rb") as f:
        response = httpx.post(
            f"{API_URL}/{COLLECTION_ROUTE}/upload-data",
            files={"file": ("LGA_trends.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers={"Authorization": f"Bearer {STAGING_JWT}"}
        )
        assert response.status_code == 200

    # ── Step 2: Wait for raw data to land in S3 ─────────────────────────
    raw_key = "raw/sydney_crime.xlsx"
    assert wait_for_s3_object(s3, STAGING_BUCKET, raw_key), \
        "Collection service never wrote to S3"

    # ── Step 3: Trigger the Processing Service ───────────────────────────
    response = httpx.post(
        f"{API_URL}/{PROCESSING_ROUTE}/process",
        json={"s3_key": raw_key}
    )
    assert response.status_code == 200

    # ── Step 4: Wait for processed data to land in S3 ───────────────────
    processed_key = "processed/sydney_crime.json"
    assert wait_for_s3_object(s3, STAGING_BUCKET, processed_key), \
        "Processing service never wrote output to S3"

    # ── Step 5: Query the Retrieval Service ─────────────────────────────
    response = httpx.get(
        f"{RETRIEVAL_SERVICE_URL}/data",
        params={"location": "Sydney", "category": "crime"}
    )
    assert response.status_code == 200
    data = response.json()

    # ── Step 6: Assert the full chain produced correct output ────────────
    assert len(data["results"]) > 0
    assert data["results"][0]["location"] == "Sydney"