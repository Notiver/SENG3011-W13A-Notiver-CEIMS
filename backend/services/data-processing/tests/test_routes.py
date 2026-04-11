import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app

client = TestClient(app)

# Generates a fake JWT header
@pytest.fixture
def auth_headers():
    fake_token = "Bearer header.eyJ1c2VybmFtZSI6InRlc3RfamFuZSJ9.signature"
    return {"Authorization": fake_token}

class TestProcessRoutes:

    def test_root_endpoint(self):
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "Data Processing Service is running" in data["message"]
        assert "target_bucket" in data
        assert "region" in data

    @patch('app.api.routes.run_nlp_pipeline')
    def test_process_articles_success(self, mock_pipeline, auth_headers):
        """Tests successful NLP trigger with auth and a job_id parameter."""
        mock_pipeline.return_value = {"status": "success", "processed": 5, "skipped": 0}
        
        response = client.post(
            "/process-articles/mock-job-123", 
            headers=auth_headers
        )
        
        assert response.status_code == 200
        assert "test_jane" in response.json()["message"]
        assert response.json()["job_id"] == "mock-job-123"

    @patch('app.api.routes.run_nlp_pipeline')
    def test_process_articles_unauthorized(self, mock_pipeline):
        """Verify it defaults to guest_user when no token is provided."""
        mock_pipeline.return_value = {"status": "success", "processed": 1}
        
        response = client.post("/process-articles/mock-job-123")
        
        assert response.status_code == 200
        assert "guest_user" in response.json()["message"]

    @patch('app.api.routes.fetch_processed_data')
    def test_get_processed_articles_success(self, mock_fetch, auth_headers):
        """Tests the retrieval route successfully fetches processed data."""
        mock_fetch.return_value = {
            "status": "success", 
            "processed": 5, 
            "s3_key": "users/test_jane/processed_intelligence/mock-job-123_processed.json"
        }
        
        response = client.get("/processed-articles/mock-job-123", headers=auth_headers)
        
        assert response.status_code == 200
        assert response.json()["processed"] == 5

    @patch('app.api.routes.fetch_processed_data')
    def test_get_processed_articles_not_found(self, mock_fetch, auth_headers):
        """Tests the retrieval route handles a still-processing or missing job gracefully."""
        # Mock the scenario where S3 doesn't have the file yet
        mock_fetch.return_value = {"error": "Processed data not found for this job."}
        
        response = client.get("/processed-articles/invalid-job-404", headers=auth_headers)
        
        assert response.status_code == 200
        assert "Processed data not found" in response.json()["error"]