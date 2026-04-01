import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import app

client = TestClient(app)


# Generates a fake JWT header
@pytest.fixture
def auth_headers():
    fake_token = "Bearer header.eyJ1c2VybmFtZSI6InRlc3RfamFuZSJ9.signature"
    return {"Authorization": fake_token}

@pytest.fixture
def valid_payload():
    return {
        "location": "Sydney",
        "timeFrame": "5_per_month_1_year",
        "category": "crime"
    }

class TestProcessRoutes:

    def test_root_endpoint(self):
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "Data Processing Service is running" in data["message"]
        assert "target_bucket" in data
        assert "region" in data

    @patch('app.api.routes.run_nlp_pipeline')
    def test_process_articles_success(self, mock_pipeline, auth_headers, valid_payload):
        """Tests successful NLP trigger with auth and valid body."""
        mock_pipeline.return_value = {"processed": 5, "skipped": 0}
        
        response = client.post(
            "/process-articles", 
            json=valid_payload, 
            headers=auth_headers
        )
        
        assert response.status_code == 200
        assert "test_jane" in response.json()["message"]
        assert "users/test_jane/" in response.json()["output_folder"]

    @patch('app.api.routes.run_nlp_pipeline')
    def test_process_articles_unauthorized(self, mock_pipeline, valid_payload):
        """Verify it defaults to guest_user when no token is provided."""
        mock_pipeline.return_value = {"processed": 1}
        
        response = client.post("/process-articles", json=valid_payload)
        
        assert response.status_code == 200
        assert "guest_user" in response.json()["message"]

    @patch('boto3.Session')
    def test_get_processed_articles_empty_s3(self, mock_boto, auth_headers):
        """Tests the retrieval route handles an empty S3 bucket gracefully."""
        # Mock S3 list_objects_v2 to return no contents
        mock_s3 = MagicMock()
        mock_boto.return_value.client.return_value = mock_s3
        mock_s3.list_objects_v2.return_value = {}
        
        response = client.get("/processed-articles", headers=auth_headers)
        
        assert response.status_code == 200
        assert response.json()["articles"] == []
        assert response.json()["user_id"] == "test_jane"

    def test_process_articles_invalid_body(self, auth_headers):
        """Tests that missing fields trigger a 422 (Pydantic validation)."""
        bad_payload = {"location": "Sydney"}
        response = client.post("/process-articles", json=bad_payload, headers=auth_headers)
        
        assert response.status_code == 422