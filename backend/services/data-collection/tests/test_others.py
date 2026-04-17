import os
import tempfile
import pytest
import pandas as pd
import json
from unittest.mock import patch, MagicMock, mock_open
from botocore.exceptions import NoCredentialsError
from fastapi import UploadFile, HTTPException

# Adjust imports based on your folder structure
from app.utils.fetch_urls import get_random_monthly_articles
from app.utils.article_scraper import upload_to_s3, process_articles
from app.services.process_excel import parse_trend, process_data
from app.database.s3 import (
    upload_fileobj_to_s3, 
    collect_data, 
    collect_data_url, 
    fetch_all_articles
)

PREFIX="/data-collection"

@patch('app.utils.fetch_urls.time.sleep') # Mocks sleep so the test runs instantly
@patch('app.utils.fetch_urls.requests.get')
def test_get_random_monthly_articles_happy_path(mock_get, mock_sleep):
    """Tests line 10-27: Successful fetch on the first try."""
    # 1. Setup a fake successful response
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "response": {"results": [{"webUrl": "https://fake-guardian.com/article1"}]}
    }
    mock_get.return_value = mock_response

    # 2. Create a temporary file that cleans itself up after the test
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        temp_filename = tmp.name

    try:
        # We only run it for 1 year to keep the test fast (12 loops)
        get_random_monthly_articles(2021, 2021, filename=temp_filename)
        
        with open(temp_filename, "r") as f:
            lines = f.readlines()
            
        assert len(lines) == 12 
        assert "https://fake-guardian.com/article1" in lines[0]
    finally:
        os.remove(temp_filename)


@patch('app.utils.fetch_urls.time.sleep')
@patch('app.utils.fetch_urls.requests.get')
def test_get_random_monthly_articles_fallback_and_error(mock_get, mock_sleep):
    """Tests lines 29-45: The fallback logic when the first day is quiet, and the exception block."""
    
    # Fake response 1: Empty results (Triggers the fallback block)
    mock_empty = MagicMock()
    mock_empty.status_code = 200
    mock_empty.json.return_value = {"response": {"results": []}}
    
    # Fake response 2: Fallback succeeds
    mock_fallback = MagicMock()
    mock_fallback.status_code = 200
    mock_fallback.json.return_value = {
        "response": {"results": [
            {"webUrl": "https://fallback.com", "webPublicationDate": "2021-01-15T10:00:00"}
        ]}
    }
    
    # Fake response 3: Fallback is also empty
    mock_total_empty = MagicMock()
    mock_total_empty.status_code = 200
    mock_total_empty.json.return_value = {"response": {"results": []}}
    
    mock_get.side_effect = [
        mock_empty, mock_fallback,        # Loop 1: Fails first try, fallback succeeds
        mock_empty, mock_total_empty,     # Loop 2: Fails first try, fallback fails
        Exception("Simulated API Crash")  # Loop 3: Total crash
    ] + [mock_empty] * 20                 # Pad the rest of the 12-month loops
    
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        temp_filename = tmp.name

    try:
        # Function catches exceptions, so it won't crash the test
        get_random_monthly_articles(2021, 2021, filename=temp_filename)
        
        with open(temp_filename, "r") as f:
            lines = f.readlines()
            
        assert len(lines) == 1 # Only the successful fallback should have written to the file
        assert "https://fallback.com" in lines[0]
    finally:
        os.remove(temp_filename)

@patch('app.utils.article_scraper.boto3.client')
def test_upload_to_s3_success(mock_boto):
    """Tests successful S3 upload (lines 16-19)."""
    upload_to_s3("fake content", "test.txt")
    mock_boto.return_value.put_object.assert_called_once_with(
        Bucket=None, # Will be None in test env if dotenv isn't loaded, which is fine
        Key="test.txt", 
        Body="fake content"
    )

@patch('app.utils.article_scraper.boto3.client')
def test_upload_to_s3_exceptions(mock_boto):
    """Tests the NoCredentialsError and general Exception blocks (lines 20-23)."""
    # Test NoCredentialsError
    mock_boto.return_value.put_object.side_effect = NoCredentialsError()
    upload_to_s3("fake content", "test.txt") # Shouldn't crash!
    
    # Test general Exception
    mock_boto.return_value.put_object.side_effect = Exception("S3 Down")
    upload_to_s3("fake content", "test.txt") # Shouldn't crash!


@patch('app.utils.article_scraper.os.path.exists')
def test_process_articles_no_file(mock_exists):
    """Tests early exit if the URL file doesn't exist (lines 26-28)."""
    mock_exists.return_value = False
    process_articles()
    # It returns early, so nothing else should happen.


@patch('app.utils.article_scraper.os.path.exists')
@patch('builtins.open', new_callable=mock_open, read_data="http://article1.com\nhttp://article2.com")
@patch('app.utils.article_scraper.newspaper.article')
@patch('app.utils.article_scraper.upload_to_s3')
def test_process_articles_flow(mock_upload, mock_newspaper, mock_file, mock_exists):
    """Tests the full scraping loop, including skips and exceptions (lines 30-57)."""
    mock_exists.return_value = True
    
    # Setup mock articles
    mock_good_article = MagicMock()
    mock_good_article.text = "This is a real article."
    
    mock_empty_article = MagicMock()
    mock_empty_article.text = ""
    
    mock_newspaper.side_effect = [mock_good_article, mock_empty_article]
    
    process_articles()
    
    # Upload should only be called ONCE (for the good article)
    mock_upload.assert_called_once_with("This is a real article.", "news/article_0.txt")


@patch('app.utils.article_scraper.os.path.exists')
@patch('builtins.open', new_callable=mock_open, read_data="http://article1.com")
@patch('app.utils.article_scraper.newspaper.article')
def test_process_articles_exception(mock_newspaper, mock_file, mock_exists):
    """Tests line 50-51: The scraper crashes on an article."""
    mock_exists.return_value = True
    mock_newspaper.side_effect = Exception("Newspaper4k crashed")
    
    process_articles() # Should gracefully print the error and not crash the test
    
def test_parse_trend():
    """Tests the regex and string parsing logic for trend data."""
    # Test None and 'nc'
    assert parse_trend(None) == {"direction": None, "percent": None}
    assert parse_trend("nc") == {"direction": None, "percent": None}
    assert parse_trend(" NC ") == {"direction": None, "percent": None}
    
    # Test 'stable'
    assert parse_trend("stable") == {"direction": "stable", "percent": 0.0}
    assert parse_trend(" Stable ") == {"direction": "stable", "percent": 0.0}
    
    # Test 'Up/Down' regex extraction
    assert parse_trend("Up 6.7%") == {"direction": "up", "percent": 6.7}
    assert parse_trend("Down 3.5%") == {"direction": "down", "percent": 3.5}
    
    # Test fallback for weird strings
    assert parse_trend("Random String") == {"direction": None, "percent": None}


def test_process_data_invalid_extension():
    """Tests that uploading a non-Excel file throws a 400 error."""
    # Mock an uploaded file with a bad extension
    bad_file = MagicMock(spec=UploadFile)
    bad_file.filename = "image.png"
    
    with pytest.raises(HTTPException) as exc_info:
        process_data(bad_file)
        
    assert exc_info.value.status_code == 400
    assert "Invalid file type" in exc_info.value.detail


@patch('app.services.process_excel.pd.read_excel')
@patch('app.services.process_excel.config')
def test_process_data_success(mock_config, mock_read_excel):
    """Tests the core pandas cleaning, melting, and Pydantic model generation."""
    
    mock_config.RAW_LGA_COL = "LGA"
    mock_config.RAW_OFFENCE_COL = "Offence"
    mock_config.RAW_RATE_COL = "Rate"
    mock_config.RAW_TREND_COL = "Trend"
    mock_config.PD_ENGINE = "calamine"
    mock_config.VERSION = "1.0"
    mock_config.DEFAULT_TIMEZONE = "Australia/Sydney"
    
    fake_data = {
        "LGA": ["Sydney", "Parramatta"],
        "Offence": ["*Theft*", "Assault"], 
        "Rate": [120.5, "nc"],            
        "Trend": ["Up 5.0%", "stable"],
        "Oct 2018 - Sep 2019": [100, 50], 
        "Oct 2019 - Sep 2020": [105, 50]
    }
    mock_df = pd.DataFrame(fake_data)
    mock_read_excel.return_value = mock_df
    
    # 3. Setup a mock UploadFile
    good_file = MagicMock(spec=UploadFile)
    good_file.filename = "LGA_trends.xlsx"
    good_file.file = MagicMock()
    
    # 4. Call the function!
    result_json_str = process_data(good_file)
    result = json.loads(result_json_str)
    
    assert result["data_source"] == "BOSCAR Data"
    assert result["version"] == "1.0"
    
    events = result["events"]
    assert len(events) == 4
    
    # Verify data cleaning worked on the first event (Sydney Theft)
    sydney_event = next(e for e in events if e["lga"] == "Sydney" and e["time_object"]["date_start"] == "2018-10-01")
    assert sydney_event["offence_type"] == "Theft" # Asterisks were successfully removed
    assert sydney_event["ten_year_trend"] == "up"
    assert sydney_event["ten_year_percent_change"] == 5.0
    
    # Verify 'nc' replacement worked on Parramatta
    parra_event = next(e for e in events if e["lga"] == "Parramatta")
    assert parra_event["rate_per_100k"] is None # 'nc' converted to None natively

@patch('app.database.s3.boto3.client')
def test_upload_fileobj_to_s3(mock_boto):
    mock_s3 = mock_boto.return_value
    
    upload_fileobj_to_s3("fake_buffer", "test-bucket", "data.xlsx")
    mock_s3.upload_fileobj.assert_called_once_with("fake_buffer", "test-bucket", "data.xlsx")
    
    mock_s3.upload_fileobj.side_effect = Exception("S3 Upload Failed")
    # This shouldn't crash the test because the function catches the exception
    upload_fileobj_to_s3("fake_buffer", "test-bucket", "data.xlsx")


@patch('app.database.s3.boto3.client')
def test_collect_data(mock_boto):
    mock_s3 = mock_boto.return_value
    
    # Setup the fake AWS response dictionary
    mock_s3.get_object.return_value = {
        'Body': 'fake_stream_data', 
        'ContentType': 'application/vnd.ms-excel'
    }
    
    body, content_type = collect_data("test-bucket", "data.xlsx")
    
    assert body == 'fake_stream_data'
    assert content_type == 'application/vnd.ms-excel'


@patch('app.database.s3.config')
@patch('app.database.s3.boto3.client')
def test_collect_data_url(mock_boto, mock_config):
    mock_config.EXPIRATION = 3600
    mock_s3 = mock_boto.return_value
    mock_s3.generate_presigned_url.return_value = "https://fake-presigned-url.com"
    
    url = collect_data_url("test-bucket", "data.xlsx")
    
    assert url == "https://fake-presigned-url.com"
    mock_s3.generate_presigned_url.assert_called_once()


@patch('app.database.s3.boto3.client')
def test_fetch_all_articles(mock_boto):
    mock_s3 = mock_boto.return_value
    
    mock_s3.list_objects_v2.return_value = {}
    assert fetch_all_articles("test-bucket", "news/") == []
    
    mock_s3.list_objects_v2.return_value = {
        'Contents': [
            {'Key': 'news/image.png'},  # Should be skipped (not .txt)
            {'Key': 'news/article1.txt'}, # Should be processed successfully
            {'Key': 'news/article2.txt'}  # Should trigger the exception block
        ]
    }
    
    good_response = MagicMock()
    good_response['Body'].read.return_value = b"This is a news article."
    good_response.get.return_value = {"publish_date": "2026-03-30"}
    
    def get_object_side_effect(Bucket, Key):
        if Key == 'news/article1.txt':
            return good_response
        elif Key == 'news/article2.txt':
            raise Exception("File corrupted")
            
    mock_s3.get_object.side_effect = get_object_side_effect
    
    # Run the function
    articles = fetch_all_articles("test-bucket", "news/")
    
    # Assertions
    assert len(articles) == 1 # Only article1 should survive
    
    assert articles[0]["file_key"] == "news/article1.txt"
    assert articles[0]["content"] == "This is a news article."
    assert articles[0]["metadata"] == {"publish_date": "2026-03-30"}