import os
import json
import base64
import pytest
import boto3
from fastapi.testclient import TestClient
from moto import mock_aws
from unittest.mock import patch

# Adjust imports based on your actual data-collection app structure
from app.main import app 
from app import config

client = TestClient(app)

@pytest.fixture
def mock_s3_env():
    """Sets up a clean Moto S3 environment for our tests."""
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    
    os.environ["AWS_DEFAULT_REGION"] = config.REGION if hasattr(config, 'REGION') else "ap-southeast-2"
    
    with mock_aws():
        s3 = boto3.client("s3", region_name=os.environ["AWS_DEFAULT_REGION"])
        s3.create_bucket(
            Bucket=config.S3_BUCKET_NAME,
            CreateBucketConfiguration={'LocationConstraint': os.environ["AWS_DEFAULT_REGION"]}
        )
        yield s3

@pytest.fixture
def auth_headers():
    """Generates a fake JWT token that your get_user_id() function can successfully decode."""
    # Your auth function looks for "username" or "sub" in the payload
    payload = {"username": "test_scraper_user"}
    
    # Base64 encode the payload exactly how a real JWT does it
    payload_json = json.dumps(payload).encode("utf-8")
    payload_b64 = base64.b64encode(payload_json).decode("utf-8")
    
    # Construct the 3-part JWT string: header.payload.signature
    fake_jwt = f"fakeHeader.{payload_b64}.fakeSignature"
    
    return {"Authorization": f"Bearer {fake_jwt}"}

def test_root_endpoint():
    """Tests the public homepage route."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to Notiver's homepage!"}

@patch('boto3.client')
@patch('app.api.routes.collect_data_url')
def test_get_collect_data_success(mock_url_generator, mock_boto_client, mock_s3_env):
    """Integration Test: Validates that the API successfully requests a pre-signed S3 URL."""
    
    mock_url_generator.return_value = "https://fake-aws-url.com/excel.xlsx"
    response = client.get("/collect-data")

    assert response.status_code == 200, response.json() 
    
    data = response.json()
    assert "url" in data
    assert data["url"] == "https://fake-aws-url.com/excel.xlsx"

def test_get_collect_data_not_found(mock_s3_env):
    """Tests the 404 error block if the file has not been uploaded to S3 yet."""
    # We do NOT seed the bucket this time.
    response = client.get("/collect-data")
    
    # Your route throws a 404 HTTPException if the file generation fails
    assert response.status_code == 404
    assert "Error finding file" in response.json()["detail"]

# Patch the exact location where run_dynamic_scraper is imported in your routes.py!
@patch('app.api.routes.run_dynamic_scraper')
def test_post_collect_articles_authenticated(mock_scraper, auth_headers):
    """
    Tests the dynamic scraper route:
    1. Validates the JWT Decoding logic successfully identifies the user.
    2. Ensures the ScrapeRequest Pydantic model accepts the JSON body.
    """
    # 1. Setup our fake scraped articles
    mock_scraper.return_value = [
        {"title": "Robbery in Sydney", "content": "Fake article 1"},
        {"title": "Speeding in Parramatta", "content": "Fake article 2"}
    ]
    
    # 2. The JSON body matching your ScrapeRequest model
    payload = {
        "location": "Sydney",
        "timeFrame": "1_year",
        "category": "crime"
    }

    # 3. Hit the endpoint WITH our generated auth headers
    response = client.post("/collect-articles", json=payload, headers=auth_headers)

    # 4. Assertions
    assert response.status_code == 200
    data = response.json()
    
    assert data["status"] == "success"
    assert data["user_id"] == "test_scraper_user"  # Proves JWT decoding worked!
    assert data["count"] == 2
    assert len(data["articles"]) == 2
    
    # Verify the API passed the correct arguments to the background scraper
    mock_scraper.assert_called_once_with(
        location="Sydney",
        time_frame="1_year",
        category="crime",
        user_id="test_scraper_user"
    )

@patch('app.api.routes.run_dynamic_scraper')
def test_post_collect_articles_unauthenticated(mock_scraper):
    """Tests that missing auth headers gracefully fall back to 'guest_user'."""
    mock_scraper.return_value = []
    
    payload = {"location": "Sydney", "timeFrame": "1_year", "category": "crime"}
    
    # Notice we are NOT passing auth_headers here
    response = client.post("/collect-articles", json=payload)
    
    assert response.status_code == 200
    assert response.json()["user_id"] == "guest_user"