import httpx
from util_auth import STAGING_JWT

from util_config import API_URL, COLLECTION_ROUTE, PROCESSING_ROUTE, \
    RETRIEVAL_ROUTE, BUCKET, TIMEOUT

from conftest import wait_for_s3_object

EXCEL_FILE_PATH = "test_data/LGA_trends.xlsx"

# === e2e tests ===
def test_e2e_data(s3):
    '''e2e test for crime data collection, processing, and retrieval'''
    print("e2e: data")

    # data collection - upload
    print("Uploading Excel file to collection endpoint...", end="", flush=True)
    with open(EXCEL_FILE_PATH, "rb") as f:
        response = httpx.post(
            f"{API_URL}/{COLLECTION_ROUTE}/upload-data",
            files={"my_file": ("LGA_trends.xlsx", f, \
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers={"Authorization": f"Bearer {STAGING_JWT}"},
            timeout=TIMEOUT
        )
        assert response.status_code == 200, response.json()
        print("success")

    # data collection - check for file upload in S3
    print("Checking for uploaded file in S3...", end="", flush=True)
    excel_file = "boscar/crime_data.json"
    assert wait_for_s3_object(s3, BUCKET, excel_file), "failed"
    print("success")

    # data processing
    # === NOT TESTED E2E ANYMORE AS QUEUING SYSTEM IN PLACE ===

    # print("Triggering data processing...", end="", flush=True)
    # response = httpx.post(
    #     f"{API_URL}/{PROCESSING_ROUTE}/process-articles",
    #     json={
    #         "location": "Bondi",
    #         "timeFrame": "1_per_month_5_years",
    #         "category": "police"
    #     },
    #     headers={"Authorization": f"Bearer {STAGING_JWT}"},
    #     timeout=TIMEOUT
    # )
    # assert response.status_code == 200, f"failed: {response.text}"
    # print("success")

    # data retrieval
    print("Retrieving data...", end="")
    response = httpx.get(
        f"{API_URL}/{RETRIEVAL_ROUTE}/lgas",
    )
    assert response.status_code == 200, "failed"
    print("success")
    data = response.json()
    assert len(data) > 0
    assert isinstance(data, dict)
    assert "lgas" in data

def test_e2e_articles(s3):
    '''e2e test for articles'''
    print("e2e: articles")

    # data collection - check articles uploaded in s3
    print("Checking for uploaded file in S3...", end="", flush=True)
    excel_file = "boscar/crime_data.json"
    assert wait_for_s3_object(s3, BUCKET, excel_file), "failed"
    print("success")

    # data collection - collect articles
    print("Collecting articles...", end="", flush=True)
    response = httpx.get(
        f"{API_URL}/{COLLECTION_ROUTE}/collect-articles",
        headers={"Authorization": f"Bearer {STAGING_JWT}"},
        timeout=TIMEOUT
    )
    assert response.status_code == 200, "failed"
    print("success")
    data = response.json()
    assert len(data) > 0

    # === NOT TESTED E2E ANYMORE AS QUEUING SYSTEM IN PLACE ===

    # data processing - process articles
    # print("Triggering data processing...", end="", flush=True)
    # response = httpx.post(
    #     f"{API_URL}/{PROCESSING_ROUTE}/process-articles",
    #     json={
    #         "location": "Sydney",
    #         "timeFrame": "1_per_month_1_year",
    #         "category": "crime"
    #     },
    #     headers={"Authorization": f"Bearer {STAGING_JWT}"},
    #     timeout=TIMEOUT
    # )
    # assert response.status_code == 200, f"failed: {response.text}"
    # print("success")

    # # data processing - check for processed file in S3
    # print("Checking for processed file in S3...", end="", flush=True)
    # article_bucket = BUCKET + "/" + response.json().get("output_folder")
    # articles = s3.list_objects_v2(Bucket=article_bucket)
    # assert "Contents" in articles, f"No files found in {BUCKET}"
    # print("success")

    # # data processing - get processed articles
    # print("Getting processed articles...", end="", flush=True)
    # response = httpx.get(
    #     f"{API_URL}/{PROCESSING_ROUTE}/processed-articles",
    #     headers={"Authorization": f"Bearer {STAGING_JWT}"},
    #     timeout=TIMEOUT
    # )
    # assert response.status_code == 200, f"failed: {response.text}"
    # print("success")

    # data retrieval
    print("Running retrieval...", end="")
    response = httpx.post(
        f"{API_URL}/{RETRIEVAL_ROUTE}/run-retrieval",
    )
    assert response.status_code == 200, "failed"
    print("success")

    # specific lga
    print("Getting LGA specific data for Bondi...", end="")
    lga = "Waverley Council"
    response = httpx.get(
        f"{API_URL}/{RETRIEVAL_ROUTE}/lga/{lga}",
    )
    assert response.status_code == 200, "failed"
    print("success")

    # years
    print("Getting LGA by year info...", end="")
    response = httpx.get(
        f"{API_URL}/{RETRIEVAL_ROUTE}/lga/{lga}/yearly",
    )
    assert response.status_code == 200, "failed"
    print("success")
    data = response.json()

    # retrieval content checks
    assert len(data) > 0