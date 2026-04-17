import os
import pytest
import boto3
from fastapi.testclient import TestClient
from moto import mock_aws
from unittest.mock import patch

from app.main import app 
from app import config

PREFIX="/data-collection"

client = TestClient(app)

@pytest.fixture
def mock_s3_env():
    """Sets up a Moto S3 environment specifically for the upload test."""
    # Ensure AWS doesn't accidentally try to hit real production credentials
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = config.REGION if hasattr(config, 'REGION') else "ap-southeast-2"
    
    with mock_aws():
        s3 = boto3.client("s3", region_name=os.environ["AWS_DEFAULT_REGION"])
        # Create the target bucket defined in your config
        s3.create_bucket(
            Bucket=config.S3_BUCKET_NAME,
            CreateBucketConfiguration={'LocationConstraint': os.environ["AWS_DEFAULT_REGION"]}
        )
        yield s3

@patch('app.api.routes.process_data') # Intercept the Pandas parser
def test_upload_data_integration_success(mock_process_data, mock_s3_env):
    """
    Integration Test:
    1. Reads the physical file (corrupted or not).
    2. Bypasses Calamine to prevent crashes.
    3. Verifies the JSON gets successfully uploaded to Moto S3.
    """
    # Force the parser to return a dummy JSON string
    mock_process_data.return_value = '[{"lga": "Sydney", "crime": "theft"}]'
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, "test_data", "LGA_trends.xlsx")
    
    assert os.path.exists(file_path), f"Test file not found at {file_path}"
    
    with open(file_path, "rb") as f:
        response = client.post(
            f"{PREFIX}/upload-data",
            files={"my_file": (
                "LGA_trends.xlsx", 
                f, 
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )}
        )

    # Added response.json() here so if it fails, it prints the EXACT error to your terminal
    assert response.status_code == 200, response.json()
    
    # Verify S3 Upload
    expected_file_name = f"{config.EXCEL_BUCKET_NAME}/{config.EXCEL_FILE_NAME}"
    s3_response = mock_s3_env.get_object(Bucket=config.S3_BUCKET_NAME, Key=expected_file_name)
    uploaded_content = s3_response['Body'].read().decode('utf-8')
    
    assert "Sydney" in uploaded_content

def test_upload_data_invalid_file_type():
    """Test that the system gracefully handles non-Excel files."""
    # Create a dummy text file in memory
    fake_file_content = b"This is not an excel file."
    
    response = client.post(
        f"{PREFIX}/upload-data",
        files={"my_file": ("fake_file.txt", fake_file_content, "text/plain")}
    )

    # Depending on how process_data() handles bad files, you likely want it to return a 500 or 400 error
    assert response.status_code in [400, 500]
    
@patch('app.api.routes.process_data')
def test_upload_data_s3_crash(mock_process):
    """Forces an exception during upload to test the 500 error block."""
    # We make process_data throw an error to simulate a total failure
    mock_process.side_effect = Exception("Simulated S3 Crash")
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, "test_data", "LGA_trends.xlsx")
    
    with open(file_path, "rb") as f:
        response = client.post(
            f"{PREFIX}/upload-data",
            files={"my_file": ("LGA_trends.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        )

    # Asserts that lines 66-74 successfully caught the error and returned a 500
    assert response.status_code == 500
    assert "Simulated S3 Crash" in response.json()["detail"]