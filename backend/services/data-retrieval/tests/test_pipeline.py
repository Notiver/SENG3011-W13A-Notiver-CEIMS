import pytest
import boto3
from moto import mock_aws
from unittest.mock import patch, MagicMock

# Adjust the import path based on your folder structure
from app.services.retriever import process_retrieval, PipelineError

@mock_aws
@patch('app.services.retriever.requests.get')
@patch.dict('app.services.retriever.LGA_FORMAT_MAP', {'SYDNEY': 'Sydney'})
@patch.dict('app.services.retriever.CRIME_CATEGORY_MAP', {'theft': 'theft'})
@patch.dict('app.services.retriever.CRIME_WEIGHTS', {'theft': 1}) 
@patch('app.services.retriever.get_lga_population') 
def test_full_pipeline_flow(mock_pop, mock_get):
    """Test the 'Happy Path' where APIs return 200 OK and data is saved."""
    
    # 0. Setup mock population to prevent division by zero errors
    mock_pop.return_value = 100000
    stage = "staging"

    # 1. Mock the API responses
    # First call: process_articles()
    mock_articles = MagicMock()
    mock_articles.status_code = 200
    mock_articles.json.return_value = [
        {"lga": "Sydney", "severity_score": 0.5, "when": "2024-01-01"}
    ]

    # Second call: process_statistics() -> gets the data link
    mock_stats_link = MagicMock()
    mock_stats_link.status_code = 200
    mock_stats_link.json.return_value = {"url": "http://fake-data-url.com"}

    # Third call: process_statistics() -> gets the actual data
    mock_data = MagicMock()
    mock_data.status_code = 200
    mock_data.json.return_value = {
        "data_source": "BOSCAR Data",
        "data_type": "Dataset",
        "events": [{
            "lga": "SYDNEY", 
            "offence_type": "theft", 
            "offence_count": 5,
            "time_object": {"date_end": "2024-12-31"}
        }]
    }

    # Assign the mocked responses in the exact order requests.get is called
    mock_get.side_effect = [mock_articles, mock_stats_link, mock_data]

    # 2. Setup: Create the fake DynamoDB tables in Moto
    dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
    lga_overall_table = f'lga-overall-{stage}'
    lga_by_year_table = f'lga-by-year-{stage}'
    
    dynamodb.create_table(
        TableName=lga_overall_table,
        KeySchema=[{'AttributeName': 'lga', 'KeyType': 'HASH'}],
        AttributeDefinitions=[{'AttributeName': 'lga', 'AttributeType': 'S'}],
        ProvisionedThroughput={'ReadCapacityUnits': 1, 'WriteCapacityUnits': 1}
    )
    
    dynamodb.create_table(
        TableName=lga_by_year_table,
        KeySchema=[
            {'AttributeName': 'lga', 'KeyType': 'HASH'},
            {'AttributeName': 'year', 'KeyType': 'RANGE'}
        ],
        AttributeDefinitions=[
            {'AttributeName': 'lga', 'AttributeType': 'S'},
            {'AttributeName': 'year', 'AttributeType': 'S'}
        ],
        ProvisionedThroughput={'ReadCapacityUnits': 1, 'WriteCapacityUnits': 1}
    )

    # 3. Execution: Run the refactored logic with the injected fake DB
    try:
        process_retrieval(dynamodb_resource=dynamodb, stage=stage)
    except PipelineError as e:
        pytest.fail(f"Pipeline crashed with a handled error: {e}")
    except Exception as e:
        pytest.fail(f"Pipeline crashed with an unexpected error: {e}")

    # 4. Verification: Check the lga-overall table
    overall_table = dynamodb.Table(lga_overall_table)
    overall_response = overall_table.get_item(Key={"lga": "Sydney"})
    
    assert "Item" in overall_response, "Sydney should be in lga-overall"
    assert overall_response["Item"]["total_articles"] == 1
    assert overall_response["Item"]["total_crimes"] == 5

    # Verification: Check the lga-by-year table
    by_year_table = dynamodb.Table(lga_by_year_table)
    by_year_response = by_year_table.get_item(Key={"lga": "Sydney", "year": "2024"})
    
    assert "Item" in by_year_response, "Sydney 2024 should be in lga-by-year"
    assert by_year_response["Item"]["theft"] == 5
    
    print("\n✅ Success! Pipeline processed mocked data without global variables.")


@patch('app.services.retriever.requests.get')
def test_pipeline_error_on_api_failure(mock_get):
    """Test the 'Sad Path' where the external API goes down."""
    
    # Mock a 500 Internal Server Error response
    mock_error = MagicMock()
    mock_error.status_code = 500
    mock_error.reason = "Internal Server Error"
    
    # We only need one side effect because it will fail on the first call
    mock_get.return_value = mock_error
    
    # We expect our custom PipelineError to be raised (not sys.exit!)
    with pytest.raises(PipelineError) as exc_info:
        process_retrieval() # No need to pass dynamodb here since it fails before saving
        
    assert "Error 500: Internal Server Error" in str(exc_info.value)
    print("\n✅ Success! Pipeline gracefully caught the API failure.")