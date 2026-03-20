import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

from app.main import app

client = TestClient(app)

class TestProcessRoutes:
    def test_root_endpoint(self):
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {"message": "Data Processing Service is running"}

    # Process articles TEST
    @patch('app.api.routes.run_nlp_pipeline')
    def test_process_articles_success(self, mock_pipeline):
        mock_pipeline.return_value = {"status": "success", "processed": 5}
        response = client.post("/process-articles")
        
        assert response.status_code == 200
        assert response.json() == {"status": "success", "processed": 5}
        mock_pipeline.assert_called_once()

    @patch('app.api.routes.run_nlp_pipeline')
    def test_process_articles_exception(self, mock_pipeline):
        mock_pipeline.side_effect = Exception("Model failed to load")
        response = client.post("/process-articles")
        
        assert response.status_code == 500
        assert "Pipeline error: Model failed to load" in response.json()["detail"]

    # Fetch processed articles
    @patch('app.api.routes.fetch_processed_data')
    def test_get_processed_articles_success(self, mock_fetch):
        mock_data = [{"id": 1, "lga": "Sydney", "sentiment": 0.5}]
        mock_fetch.return_value = mock_data
        
        response = client.get("/processed-articles")
        
        assert response.status_code == 200
        assert response.json() == mock_data

    @patch('app.api.routes.fetch_processed_data')
    def test_get_processed_articles_not_found(self, mock_fetch):
        mock_fetch.return_value = {"error": "No articles found in DB"}
        response = client.get("/processed-articles")
        
        assert response.status_code == 404
        assert response.json()["detail"] == "No articles found in DB"