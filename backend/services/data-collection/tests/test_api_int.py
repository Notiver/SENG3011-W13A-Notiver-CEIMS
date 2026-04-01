import os
import json
import base64
import pytest
import boto3
from fastapi.testclient import TestClient
from moto import mock_aws
from unittest.mock import patch, MagicMock

from app.main import app 
from app import config
from app.api import routes

client = TestClient(app)

@pytest.fixture
def mock_aws_env():
    """Sets up a clean Moto S3 and SQS environment for our tests."""
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = config.REGION if hasattr(config, 'REGION') else "ap-southeast-2"
    
    with mock_aws():
        # Setup Fake S3
        s3 = boto3.client("s3", region_name=os.environ["AWS_DEFAULT_REGION"])
        s3.create_bucket(
            Bucket=config.S3_BUCKET_NAME,
            CreateBucketConfiguration={'LocationConstraint': os.environ["AWS_DEFAULT_REGION"]}
        )
        
        # Setup Fake SQS Queue
        sqs = boto3.client("sqs", region_name=os.environ["AWS_DEFAULT_REGION"])
        queue = sqs.create_queue(QueueName="test-scraper-queue")
        
        # Inject the fake URL into the routes module
        fake_queue_url = queue["QueueUrl"]
        routes.SQS_QUEUE_URL = fake_queue_url
        os.environ["SQS_QUEUE_URL"] = fake_queue_url
        
        yield s3, sqs

@pytest.fixture
def auth_headers():
    """Generates a fake JWT token that your get_user_id() function can successfully decode."""
    payload = {"username": "test_scraper_user"}
    payload_json = json.dumps(payload).encode("utf-8")
    payload_b64 = base64.b64encode(payload_json).decode("utf-8")
    fake_jwt = f"fakeHeader.{payload_b64}.fakeSignature"
    return {"Authorization": f"Bearer {fake_jwt}"}

# --- STANDARD ROUTES TESTS ---

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to Notiver's homepage!"}

@patch('boto3.client')
@patch('app.api.routes.collect_data_url')
def test_get_collect_data_success(mock_url_generator, mock_boto_client, mock_aws_env):
    mock_url_generator.return_value = "https://fake-aws-url.com/excel.xlsx"
    response = client.get("/collect-data")
    assert response.status_code == 200
    assert response.json()["url"] == "https://fake-aws-url.com/excel.xlsx"

def test_get_collect_data_not_found(mock_aws_env):
    response = client.get("/collect-data")
    assert response.status_code == 404
    assert "Error finding file" in response.json()["detail"]

@patch('app.api.routes.execute_full_collection')
def test_post_articles_success(mock_execute):
    mock_execute.return_value = {"status": "success", "message": "Articles collected."}
    response = client.post("/upload-articles")
    assert response.status_code == 200

@patch('app.api.routes.execute_full_collection')
def test_post_articles_failure(mock_execute):
    mock_execute.return_value = {"status": "error", "message": "Guardian API down."}
    response = client.post("/upload-articles")
    assert response.status_code == 500
    assert response.json()["detail"] == "Guardian API down."

@patch('app.api.routes.fetch_collection_status')
def test_get_articles(mock_fetch):
    mock_fetch.return_value = {"status": "success", "count": 5}
    response = client.get("/collect-articles")
    assert response.status_code == 200
    assert response.json()["count"] == 5


# --- ASYNCHRONOUS SQS ROUTE TESTS ---

def test_post_collect_articles_authenticated(mock_aws_env, auth_headers):
    """Verifies that an authenticated request drops the correct ticket into SQS."""
    s3, sqs = mock_aws_env
    payload = {"location": "Sydney", "timeFrame": "1_year", "category": "crime"}

    response = client.post("/collect-articles", json=payload, headers=auth_headers)

    # 1. Assert the instant API response
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "processing"
    assert "job_id" in data
    
    # 2. Check the Moto mock SQS queue to see if the ticket actually arrived!
    messages = sqs.receive_message(QueueUrl=os.environ["SQS_QUEUE_URL"])["Messages"]
    assert len(messages) == 1
    
    ticket = json.loads(messages[0]["Body"])
    assert ticket["user_id"] == "test_scraper_user"  # Proves JWT decoding worked
    assert ticket["location"] == "Sydney"
    assert ticket["job_id"] == data["job_id"]

def test_post_collect_articles_unauthenticated(mock_aws_env):
    """Verifies missing auth headers fall back to guest_user in the SQS ticket."""
    s3, sqs = mock_aws_env
    payload = {"location": "Sydney", "timeFrame": "1_year", "category": "crime"}
    
    response = client.post("/collect-articles", json=payload)
    
    assert response.status_code == 200
    
    # Verify the ticket was queued under guest_user
    messages = sqs.receive_message(QueueUrl=os.environ["SQS_QUEUE_URL"])["Messages"]
    ticket = json.loads(messages[0]["Body"])
    assert ticket["user_id"] == "guest_user"

def test_get_user_id_decode_exception(mock_aws_env):
    """Verifies malformed JWTs gracefully fall back to guest_user."""
    s3, sqs = mock_aws_env
    bad_headers = {"Authorization": "Bearer not.real.base64"}
    payload = {"location": "Sydney", "timeFrame": "1_year", "category": "crime"}
    
    response = client.post("/collect-articles", json=payload, headers=bad_headers)
    assert response.status_code == 200
    
    # Verify it still queued the job, but as guest_user
    messages = sqs.receive_message(QueueUrl=os.environ["SQS_QUEUE_URL"])["Messages"]
    ticket = json.loads(messages[0]["Body"])
    assert ticket["user_id"] == "guest_user" 

@patch('app.api.routes.SQS_QUEUE_URL', None)
def test_post_collect_articles_missing_sqs_url(monkeypatch):
    """Tests the 500 configuration error block if SQS_QUEUE_URL is not set."""
    
    monkeypatch.setattr(routes, "SQS_QUEUE_URL", None)
    
    payload = {"location": "Sydney", "timeFrame": "1_year", "category": "crime"}
    response = client.post("/collect-articles", json=payload)
    
    assert response.status_code == 500
    assert "Server configuration error" in response.json()["detail"]

@patch('app.api.routes.boto3.client')
def test_post_collect_articles_sqs_exception(mock_boto_client, mock_aws_env):
    """Tests that a failure to communicate with AWS SQS returns a 500 error."""
    
    # Force the SQS client to throw an error when send_message is called
    mock_sqs = MagicMock()
    mock_sqs.send_message.side_effect = Exception("AWS is down!")
    mock_boto_client.return_value = mock_sqs
    
    payload = {"location": "Sydney", "timeFrame": "1_year", "category": "crime"}
    response = client.post("/collect-articles", json=payload)
    
    assert response.status_code == 500
    assert "Failed to queue scraping job" in response.json()["detail"]