import requests
from fastapi import APIRouter, HTTPException, Depends
from app.services.retriever import process_retrieval, process_housing
from utils.db_manager import get_db_environment
from app import config

router = APIRouter(prefix="/data-retrieval")

@router.get("/", include_in_schema=False)
def root():
    return {"message": "Data Retrieval Service is running"}

@router.post("/run-retrieval", include_in_schema=False)
def run_retrieval(env=Depends(get_db_environment)):
    """Internal pipeline trigger to aggregate S3 data into DynamoDB."""
    try:
        # Pass the injected db into the pipeline
        process_retrieval(dynamodb_resource=env['db'], stage=env['stage'])
        return {"message": "retrieval pipeline completed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")
    
@router.post("/run-retrieval-housing", include_in_schema=False)
def run_retrieval_housing(env=Depends(get_db_environment)):
    """Internal pipeline trigger to aggregate S3 data into DynamoDB, specifically for housing"""
    try:
        # Pass the injected db into the pipeline
        process_housing(dynamodb_resource=env['db'], stage=env['stage'])
        return {"message": "retrieval pipeline completed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")

@router.get("/public/ceims-articles", include_in_schema=False)
def get_public_ceims_articles():
    """Fetches the unified CEIMS data from the Data Processing API for the frontend map."""
    
    base_url = config.DATA_PROCESSING_URL.rstrip('/')
    target_api_url = f"{base_url}/public/ceims-articles"
    
    try:
        response = requests.get(target_api_url, timeout=15)
        response.raise_for_status()
        articles = response.json()
        
        return {
            "status": "success",
            "count": len(articles),
            "articles": articles
        }
    except Exception as e:
        print(f"Failed to fetch public CEIMS data from Processing API: {e}")
        return {"status": "success", "count": 0, "articles": []}

@router.get("/lgas", summary="List All Supported Regions (LGAs)")
def get_all_lgas(env=Depends(get_db_environment)):
    """
    Retrieves a comprehensive list of all Local Government Areas (LGAs) currently tracked in the regional database.
    
    **Integration Note:**
    Use this endpoint to populate dropdowns or validate location parameters before querying specific regional statistics.
    """
    try:
        table_name = f"lga-overall-{env['stage']}"
        table = env['db'].Table(table_name)
        response = table.scan()

        lgas = [item["lga"] for item in response.get("Items", [])]

        return {"lgas": lgas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/lga/{lga}", summary="Get Aggregate Regional Statistics")
def get_lga_stats(lga: str, env=Depends(get_db_environment)):
    """
    Fetches the overall aggregated crime, sentiment, and risk statistics for a specific Local Government Area (LGA).

    - **lga**: The exact string name of the LGA (e.g., "City of Sydney"). You can fetch valid names from the `/lgas` endpoint.
    
    **Returns:** A JSON object containing the unified historical risk score and statistical breakdown for the requested region.
    """
    try:
        table_name = f"lga-overall-{env['stage']}"
        table = env['db'].Table(table_name)
        response = table.get_item(Key={"lga": lga})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if "Item" not in response:
        raise HTTPException(status_code=404, detail="LGA not found")

    return response["Item"]
    
@router.get("/lga/{lga}/yearly", summary="Get Yearly Regional Statistics")
def get_lga_yearly(lga: str, env=Depends(get_db_environment)):
    """
    Retrieves a time-series breakdown of statistics for a specific Local Government Area (LGA), grouped by year.

    - **lga**: The exact string name of the LGA.
    
    **Returns:** An array of yearly data points, useful for plotting trend lines or calculating year-over-year risk deltas.
    """
    try:
        table_name = f"lga-by-year-{env['stage']}"
        table = env['db'].Table(table_name)
        response = table.query(
            KeyConditionExpression="lga = :lga",
            ExpressionAttributeValues={":lga": lga}
        )
        return response["Items"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/lga/{lga}/housing", summary="Get Housing Aggregate Regional Statistics")
def get_lga_housing(lga: str, env=Depends(get_db_environment)):
    """
    Fetches the overall aggregated housing, sentiment, and risk statistics for a specific Local Government Area (LGA).

    - **lga**: The exact string name of the LGA (e.g., "City of Sydney"). You can fetch valid names from the `/lgas` endpoint.
    
    **Returns:** A JSON object containing the unified historical housing score and statistical breakdown for the requested region.
    """
    try:
        table_name = f"lga-housing-{env['stage']}"
        table = env['db'].Table(table_name)
        response = table.query(
            KeyConditionExpression="lga = :lga",
            ExpressionAttributeValues={":lga": lga}
        )
        return response["Items"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/housing", summary="Get All Housing Aggregate Regional Statistics")
def get_lga_housing(env=Depends(get_db_environment)):
    """
    Fetches all the aggregated housing, sentiment, and risk statistics for a specific Local Government Area (LGA).

    **Returns:** A JSON object containing the unified historical housing score and statistical breakdown for all NSW lgas.
    """
    try:
        table_name = f"lga-housing-{env['stage']}"
        table = env['db'].Table(table_name)
        response = table.scan()
        
        items = response.get("Items", [])

        while 'LastEvaluatedKey' in response:
            response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
            items.extend(response.get('Items', []))
            
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    run_retrieval()