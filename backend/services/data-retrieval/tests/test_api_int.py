import pytest
import boto3
from fastapi.testclient import TestClient
from moto import mock_aws
from app.main import app
from utils.db_manager import get_db_environment
from unittest.mock import patch, MagicMock
from decimal import Decimal

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
    lga_housing_table = f'lga-housing-{stage}'
    
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        
        # 1. Create and seed 'lga-overall'
        table_overall = dynamodb.create_table(
            TableName=lga_overall_table,
            KeySchema=[{'AttributeName': 'lga', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'lga', 'AttributeType': 'S'}],
            ProvisionedThroughput={'ReadCapacityUnits': 1, 'WriteCapacityUnits': 1}
        )
        table_overall.put_item(Item={"lga": "Sydney", "total_crimes": 120})
        
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
        table_yearly.put_item(Item={"lga": "Sydney", "year": "2024", "theft": 5})
        
        # 3. Create and seed 'lga-housing' (NEW)
        table_housing = dynamodb.create_table(
            TableName=lga_housing_table,
            KeySchema=[{'AttributeName': 'lga', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'lga', 'AttributeType': 'S'}],
            ProvisionedThroughput={'ReadCapacityUnits': 1, 'WriteCapacityUnits': 1}
        )
        table_housing.put_item(Item={
            "lga": "Sydney", 
            "mean_price": 1500000, 
            "statistical_score": 50, 
            "sentiment_score": Decimal("0.6")
        })
        
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
    
def test_get_specific_housing_success(mock_db):
    """Tests that the API successfully queries a specific LGA's housing data."""
    response = client.get(f"{PREFIX}/lga/Sydney/housing")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["lga"] == "Sydney"
    assert data[0]["mean_price"] == 1500000

def test_get_lga_housing_success(mock_db):
    """Tests that the API successfully scans the housing table for all LGAs."""
    response = client.get(f"{PREFIX}/housing")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["lga"] == "Sydney"

@patch('app.api.routes.process_housing')
def test_run_retrieval_housing_success(mock_process, mock_db):
    """Tests the happy path of the housing pipeline trigger."""
    mock_process.return_value = None 
    
    response = client.post(f"{PREFIX}/run-retrieval-housing")
    assert response.status_code == 200
    assert response.json() == {"message": "retrieval pipeline completed"}
    mock_process.assert_called_once()

@patch('app.api.routes.process_housing')
def test_run_retrieval_housing_exception(mock_process, mock_db):
    """Tests the 500 error block if the housing pipeline crashes."""
    mock_process.side_effect = Exception("Housing pipeline simulated crash")
    
    response = client.post(f"{PREFIX}/run-retrieval-housing")
    assert response.status_code == 500
    assert "Housing pipeline simulated crash" in response.json()["detail"]

@patch('app.api.routes.requests.get')
def test_get_public_ceims_articles_success(mock_get):
    """Tests the successful fetching of public CEIMS articles."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = [{"lga": "Sydney", "sentiment_score": 0.8}]
    mock_get.return_value = mock_response

    response = client.get(f"{PREFIX}/public/ceims-articles")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["count"] == 1
    assert len(data["articles"]) == 1

@patch('app.api.routes.requests.get')
def test_get_public_ceims_articles_exception(mock_get):
    """Tests the fallback behavior when the processing API crashes."""
    mock_get.side_effect = Exception("Simulated Processing API Crash")

    response = client.get(f"{PREFIX}/public/ceims-articles")
    assert response.status_code == 200 
    data = response.json()
    assert data["status"] == "success"
    assert data["count"] == 0
    assert data["articles"] == []

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
    
    # Test /housing exception
    resp_all_housing = client.get(f"{PREFIX}/housing")
    assert resp_all_housing.status_code == 500
    assert "Database connection lost!" in resp_all_housing.json()["detail"]
    
    # Test /lga/{lga}/housing exception
    resp_single_housing = client.get(f"{PREFIX}/lga/Sydney/housing")
    assert resp_single_housing.status_code == 500

    # Clean up the override so it doesn't break other tests!
    app.dependency_overrides.clear()