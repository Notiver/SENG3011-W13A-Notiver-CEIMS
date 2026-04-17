import pytest
import json
from unittest.mock import patch, MagicMock
from app.services.processor_v2 import run_nlp_pipeline, fetch_processed_data

PREFIX="/data-processing"

@pytest.fixture
def mock_pipeline():
    """Mocks the heavy Hugging Face RoBERTa model so tests run instantly."""
    with patch("transformers.pipeline") as mock:
        mock_instance = MagicMock()
        mock_instance.return_value = [[{"label": "negative", "score": 0.8500}]]
        mock.return_value = mock_instance
        yield mock
@pytest.fixture
def mock_s3():
    """Mocks the S3 client so we don't actually hit AWS."""
    with patch("app.services.processor_v2.s3") as mock:
        mock.exceptions.NoSuchKey = type('NoSuchKey', (Exception,), {})
        yield mock

@pytest.fixture
def mock_requests():
    with patch("app.services.processor_v2.requests.get") as mock:
        yield mock

@pytest.fixture
def mock_classifiers():
    """Mocks the custom NLP utility functions."""
    with patch("app.services.processor_v2.get_location_metadata") as mock_loc, \
         patch("app.services.processor_v2.classify_crime") as mock_crime:
        mock_loc.return_value = {"suburb": "Parramatta", "lga": "City of Parramatta", "postcode": "2150"}
        mock_crime.return_value = "Theft"
        yield mock_loc, mock_crime

@pytest.fixture(autouse=True)
def mock_tracer():
    """Mocks the Powertools tracer so X-Ray doesn't crash local testing."""
    with patch("app.services.processor_v2.tracer") as mock:
        yield mock
class TestFetchProcessedData:
    def test_fetch_success(self, mock_s3):
        # Mock S3 returning a valid JSON file
        mock_response = {'Body': MagicMock()}
        mock_response['Body'].read.return_value = b'[{"object_id": "123", "sentiment_score": 0.85}]'
        mock_s3.get_object.return_value = mock_response

        result = fetch_processed_data(job_id="job-123", user_id="test_user")
        assert len(result) == 1
        assert result[0]["object_id"] == "123"
        mock_s3.get_object.assert_called_once()

    def test_fetch_no_such_key(self, mock_s3):
        # "File not found" error
        mock_s3.get_object.side_effect = mock_s3.exceptions.NoSuchKey()
        
        result = fetch_processed_data(job_id="job-123")
        assert "error" in result
        assert "not found" in result["error"]

    def test_fetch_general_exception(self, mock_s3):
        mock_s3.get_object.side_effect = Exception("AWS is down")
        with pytest.raises(Exception) as excinfo:
            fetch_processed_data(job_id="job-123")
        assert "AWS is down" in str(excinfo.value)

# --- TESTS FOR: run_nlp_pipeline ---

class TestRunNlpPipeline:
    def test_api_fetch_failure(self, mock_pipeline, mock_requests):
        mock_requests.side_effect = Exception("Connection Timeout")
        
        result = run_nlp_pipeline(job_id="job-123")
        assert result["status"] == "error"
        assert "Failed to fetch from collection API" in result["message"]

    def test_job_not_complete(self, mock_pipeline, mock_requests):
        mock_response = MagicMock()
        mock_response.json.return_value = {"status": "processing"}
        mock_requests.return_value = mock_response
        
        result = run_nlp_pipeline(job_id="job-123")
        assert result["status"] == "error"
        assert "not complete yet" in result["message"]

    def test_empty_articles(self, mock_pipeline, mock_requests):
        # Simulate a completed job with 0 articles
        mock_response = MagicMock()
        mock_response.json.return_value = {"status": "complete", "articles": []}
        mock_requests.return_value = mock_response
        
        result = run_nlp_pipeline(job_id="job-123")
        assert result["status"] == "success"
        assert "No articles found" in result["message"]

    def test_successful_private_job(self, mock_pipeline, mock_requests, mock_s3, mock_classifiers):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "status": "complete",
            "articles": [
                {"file_key": "news/123.txt", "content": "Bad crime happened.", "metadata": {}},
                {"file_key": "news/empty.txt", "content": "", "metadata": {}}
            ]
        }
        mock_requests.return_value = mock_response

        result = run_nlp_pipeline(job_id="job-123", user_id="jane_doe")
        
        assert result["status"] == "success"
        assert result["processed"] == 1
        assert result["skipped"] == 1
        
        # Verify it uploaded to the private user folder
        mock_s3.put_object.assert_called_once()
        called_args = mock_s3.put_object.call_args[1]
        assert "users/jane_doe/processed_intelligence" in called_args["Key"]
        
        # Parse the JSON string back into a python dict
        uploaded_json = json.loads(called_args["Body"])
        assert len(uploaded_json) == 1
        assert uploaded_json[0]["object_id"] == "123"
        
        assert "sentiment_score" in uploaded_json[0]
        assert isinstance(uploaded_json[0]["sentiment_score"], (float, int))

    def test_successful_public_ceims_job(self, mock_pipeline, mock_requests, mock_s3, mock_classifiers):
        """Tests the community pooling logic (GET -> Append -> PUT)"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "status": "complete",
            "articles": [{"file_key": "news/ceims1.txt", "content": "Local news.", "metadata": {}}]
        }
        mock_requests.return_value = mock_response

        # Mock the existing CEIMS master file in S3
        mock_s3_get = {'Body': MagicMock()}
        mock_s3_get['Body'].read.return_value = b'[{"object_id": "old_article", "sentiment_score": 0.5}]'
        mock_s3.get_object.return_value = mock_s3_get

        # Run the pipeline WITH the CEIMS flag
        result = run_nlp_pipeline(job_id="job-123", params={"is_ceims": True})
        
        assert result["status"] == "success"
        assert result["processed"] == 1
        
        # Verify it downloaded the old file
        mock_s3.get_object.assert_called_once()
        
        # Verify it uploaded to the PUBLIC folder
        mock_s3.put_object.assert_called_once()
        called_args = mock_s3.put_object.call_args[1]
        assert called_args["Key"] == "public/ceims/all_processed_articles.json"
        
        # Verify the new file contains BOTH the old article and the new one
        uploaded_json = json.loads(called_args["Body"])
        assert len(uploaded_json) == 2
        
    def test_skip_general_crime(self, mock_pipeline, mock_requests, mock_s3):
        """Tests the filter that drops useless articles."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "status": "complete",
            "articles": [{"file_key": "news/gen.txt", "content": "Stuff happened.", "metadata": {}}]
        }
        mock_requests.return_value = mock_response

        with patch("app.services.processor_v2.get_location_metadata") as mock_loc, \
             patch("app.services.processor_v2.classify_crime") as mock_crime:
            mock_loc.return_value = {"suburb": "NSW General", "lga": "Unknown", "postcode": ""}
            mock_crime.return_value = "General Crime"
            
            result = run_nlp_pipeline(job_id="job-123", params={"is_ceims": True})
            
            assert result["status"] == "success"
            assert result["processed"] == 0
            assert result["skipped"] == 1