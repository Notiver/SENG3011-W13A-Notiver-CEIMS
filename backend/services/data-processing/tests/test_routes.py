import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import app

PREFIX="/data-processing"

client = TestClient(app)

# Generates a fake JWT header
@pytest.fixture
def auth_headers():
    fake_token = "Bearer header.eyJ1c2VybmFtZSI6InRlc3RfamFuZSJ9.signature"
    return {"Authorization": fake_token}

class TestProcessRoutes:

    def test_root_endpoint(self):
        response = client.get(f"{PREFIX}/")
        assert response.status_code == 200
        data = response.json()
        assert "Data Processing Service is running" in data["message"]
        assert "target_bucket" in data
        assert "region" in data

    @patch('app.api.routes.boto3.client')
    def test_process_articles_success(self, mock_boto3, auth_headers):
        """Tests successful NLP trigger drops an SQS message and returns 'processing'."""
        # Fake the SQS client not calling AWS during tests
        mock_sqs = MagicMock()
        mock_boto3.return_value = mock_sqs
        
        response = client.post(
            f"{PREFIX}/process-articles/mock-job-123", 
            headers=auth_headers
        )
        
        assert response.status_code == 200
        assert response.json()["status"] == "processing"
        assert response.json()["job_id"] == "mock-job-123"
        
        # Verify API successfully reaches SQS to queue the message
        mock_sqs.send_message.assert_called_once()
        
        # Intercept the SQS payload to verify the username was correctly extracted and sent
        sqs_payload = mock_sqs.send_message.call_args.kwargs["MessageBody"]
        assert "test_jane" in sqs_payload

    @patch('app.api.routes.boto3.client')
    def test_process_articles_unauthorized(self, mock_boto3):
        """Verify it defaults to guest_user when no token is provided."""
        mock_sqs = MagicMock()
        mock_boto3.return_value = mock_sqs
        
        response = client.post(f"{PREFIX}/process-articles/mock-job-123")
        
        assert response.status_code == 200
        assert response.json()["status"] == "processing"
        
        # Verify the background worker was still queued
        mock_sqs.send_message.assert_called_once()
        
        # Intercept the payload to ensure it defaulted to guest_user
        sqs_payload = mock_sqs.send_message.call_args.kwargs["MessageBody"]
        assert "guest_user" in sqs_payload

    @patch('app.api.routes.fetch_processed_data')
    def test_get_processed_articles_success(self, mock_fetch, auth_headers):
        """Tests the retrieval route successfully fetches processed data."""
        mock_fetch.return_value = {
            "status": "success", 
            "processed": 5, 
            "s3_key": "users/test_jane/processed_intelligence/mock-job-123_processed.json"
        }
        
        response = client.get(f"{PREFIX}/processed-articles/mock-job-123", headers=auth_headers)
        
        assert response.status_code == 200
        assert response.json()["processed"] == 5

    @patch('app.api.routes.fetch_processed_data')
    def test_get_processed_articles_not_found(self, mock_fetch, auth_headers):
        """Tests the retrieval route handles a still-processing or missing job gracefully."""
        # Mock the scenario where S3 doesn't have the file yet
        mock_fetch.return_value = {"error": "Processed data not found for this job."}
        
        response = client.get(f"{PREFIX}/processed-articles/invalid-job-404", headers=auth_headers)
        
        assert response.status_code == 200
        assert "Processed data not found" in response.json()["error"]