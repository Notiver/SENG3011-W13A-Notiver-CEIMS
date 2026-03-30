import os
import pytest
import boto3
import json
from fastapi.testclient import TestClient
from moto import mock_aws

from app.main import app 
from app import config

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

def test_upload_data_integration_success(mock_s3_env):
    """
    Integration Test: 
    1. Reads the real LGA_trends.xlsx file.
    2. Hits the /upload-data endpoint.
    3. Verifies the parsed JSON was saved in the S3 bucket.
    """
    
    # 1. Locate the LGA_trends.xls file inside the local test_data folder
    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, "test_data", "LGA_trends.xlsx")
    
    # Hard fail if the file isn't found so you aren't chasing phantom bugs
    assert os.path.exists(file_path), f"Test file not found at {file_path}"

    # 2. Open the Excel file in binary reading mode
    with open(file_path, "rb") as f:
        # FastAPI TestClient uses the 'files' parameter to simulate a multipart/form-data upload
        # "my_file" must exactly match the parameter name in your FastAPI route
        response = client.post(
            "/upload-data",
            files={"my_file": ("LGA_trends.xlsx", f, "application/vnd.ms-excel")}
        )

    # 3. Assert the API responded successfully
    assert response.status_code == 200
    expected_file_name = f"{config.EXCEL_BUCKET_NAME}/{config.EXCEL_FILE_NAME}"
    assert f"File '{expected_file_name}' processed and uploaded successfully!" in response.json()["message"]

    # 4. The Ultimate Integration Check: Does the file exist in S3?
    try:
        s3_response = mock_s3_env.get_object(
            Bucket=config.S3_BUCKET_NAME, 
            Key=expected_file_name
        )
    except mock_s3_env.exceptions.NoSuchKey:
        pytest.fail("The file was not uploaded to the expected S3 path!")

    # 5. Verify the contents actually parsed correctly
    uploaded_content = s3_response['Body'].read().decode('utf-8')
    parsed_json = json.loads(uploaded_content)
    
    # Assuming the parsed Excel data returns a list or dictionary.
    # You can get more specific here (e.g., assert parsed_json[0]["lga"] == "Sydney")
    assert len(parsed_json) > 0, "The uploaded JSON file is empty!"
    assert isinstance(parsed_json, (dict, list)), "Data was not formatted as valid JSON!"

def test_upload_data_invalid_file_type():
    """Test that the system gracefully handles non-Excel files."""
    # Create a dummy text file in memory
    fake_file_content = b"This is not an excel file."
    
    response = client.post(
        "/upload-data",
        files={"my_file": ("fake_file.txt", fake_file_content, "text/plain")}
    )

    # Depending on how process_data() handles bad files, you likely want it to return a 500 or 400 error
    assert response.status_code in [400, 500]