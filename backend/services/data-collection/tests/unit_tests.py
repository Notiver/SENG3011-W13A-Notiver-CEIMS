import json
from unittest.mock import MagicMock, patch
from app.main import handler # Assuming your lambda code is in app.py

@patch('app.boto3.client')
def test_get_upload_url_logic(mock_boto_client):
    # 1. Setup the Mock S3 Client
    mock_s3 = MagicMock()
    mock_boto_client.return_value = mock_s3
    
    # 2. Mock the 'generate_presigned_url' response
    mock_s3.generate_presigned_url.return_value = "https://mock-s3-url.com/upload-me"

    # 3. Simulate the API Gateway Event
    event = {
        "body": json.dumps({"filename": "large_file.pdf", "contentType": "application/pdf"})
    }

    # 4. Call the handler
    response = handler(event, None)
    body = json.loads(response["body"])

    # 5. Assertions
    assert response["statusCode"] == 200
    assert body["url"] == "https://mock-s3-url.com/upload-me"
    
    # Check if the code actually asked S3 for a 'put_object' permission
    mock_s3.generate_presigned_url.assert_called_once_with(
        ClientMethod='put_object',
        Params={'Bucket': 'your-bucket-name', 'Key': 'large_file.pdf', 'ContentType': 'application/pdf'},
        ExpiresIn=3600
    )