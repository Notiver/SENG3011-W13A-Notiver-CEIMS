import pytest
import boto3
from fastapi.testclient import TestClient
from moto import mock_aws
from app.main import app
from utils.db_manager import get_db_environment
from unittest.mock import patch

PREFIX="/data-retrieval"

client = TestClient(app)

@pytest.fixture
def mock_db():
    """Sets up a Moto DynamoDB environment and seeds it with test data."""
    import os
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
    stage = "staging"

    lga_overall_table = f'lga-overall-{stage}'
    lga_by_year_table = f'lga-by-year-{stage}'
    
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        
        # 1. Create and seed 'lga-overall'
        table_overall = dynamodb.create_table(
            TableName=lga_overall_table,
            KeySchema=[{'AttributeName': 'lga', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'lga', 'AttributeType': 'S'}],
            ProvisionedThroughput={'ReadCapacityUnits': 1, 'WriteCapacityUnits': 1}
        )
        table_overall.put_item(
            Item={"lga": "Sydney", "total_crimes": 120}
        )
        
        # 2. Create and seed 'lga-by-year'
        table_yearly = dynamodb.create_table(
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
        table_yearly.put_item(
            Item={"lga": "Sydney", "year": "2024", "theft": 5}
        )
        
        # Override FastAPI dependency
        app.dependency_overrides[get_db_environment] = lambda: {
            "db": dynamodb,
            "stage": stage
        }
        yield dynamodb
        app.dependency_overrides.clear()

def test_get_lga_stats_success(mock_db):
    """Integration Test: API successfully queries DynamoDB and returns data."""
    response = client.get(f"{PREFIX}/lga/Sydney")
    
    assert response.status_code == 200
    data = response.json()
    assert data["lga"] == "Sydney"
    assert data["total_crimes"] == 120

def test_get_lga_stats_not_found(mock_db):
    """Integration Test: API handles missing DynamoDB records correctly."""
    response = client.get(f"{PREFIX}/lga/Nowhere")
    
    assert response.status_code == 404
    assert response.json() == {"detail": "LGA not found"}
    
def test_root_endpoint():
    response = client.get(f"{PREFIX}/")
    assert response.status_code == 200
    assert response.json() == {"message": "Data Retrieval Service is running"}
    
@patch('app.api.routes.process_retrieval')
def test_run_retrieval_success(mock_process, mock_db):
    """Tests the happy path of the retrieval pipeline."""
    # We mock process_retrieval so we don't accidentally run the whole heavy pipeline during an API test
    mock_process.return_value = None 
    
    response = client.post(f"{PREFIX}/run-retrieval")
    assert response.status_code == 200
    assert response.json() == {"message": "retrieval pipeline completed"}
    mock_process.assert_called_once()

@patch('app.api.routes.process_retrieval')
def test_run_retrieval_exception(mock_process, mock_db):
    """Tests the 500 error block if the pipeline crashes."""
    # Force the mock to raise an error
    mock_process.side_effect = Exception("Simulated pipeline crash")
    
    response = client.post(f"{PREFIX}/run-retrieval")
    assert response.status_code == 500
    assert "Simulated pipeline crash" in response.json()["detail"]

def test_get_all_lgas_success(mock_db):
    """Tests that scan() successfully returns a list of LGAs."""
    response = client.get(f"{PREFIX}/lgas")
    assert response.status_code == 200
    # Because our mock_db seeded "Sydney", we expect it here!
    assert response.json() == {"lgas": ["Sydney"]}


def test_get_lga_yearly_success(mock_db):
    """Tests the query() successfully pulls yearly data."""
    response = client.get(f"{PREFIX}/lga/Sydney/yearly")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["year"] == "2024"
    assert data[0]["theft"] == 5

class BrokenDB:
    """A fake DynamoDB object that immediately crashes when trying to access a Table."""
    def Table(self, name):
        raise Exception("Database connection lost!")

def test_dynamodb_500_exceptions():
    """Injects a broken DB to ensure all routes gracefully catch and return 500 errors."""
    # Temporarily override the dependency with our broken DB
    app.dependency_overrides[get_db_environment] = lambda: {
        "db": BrokenDB(),
        "stage": "staging"
    }
    
    # Test /lgas exception
    resp_all = client.get(f"{PREFIX}/lgas")
    assert resp_all.status_code == 500
    assert "Database connection lost!" in resp_all.json()["detail"]
    
    # Test /lga/{lga} exception
    resp_single = client.get(f"{PREFIX}/lga/Sydney")
    assert resp_single.status_code == 500
    
    # Test /lga/{lga}/yearly exception
    resp_yearly = client.get(f"{PREFIX}/lga/Sydney/yearly")
    assert resp_yearly.status_code == 500
    
    # Clean up the override so it doesn't break other tests!
    app.dependency_overrides.clear()