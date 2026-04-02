from fastapi import APIRouter, HTTPException, Depends
from app.services.retriever import process_retrieval
from utils.db_manager import get_db_environment

router = APIRouter()

@router.get("/")
def root():
    return {"message": "Data Retrieval Service is running"}
@router.post("/run-retrieval")
def run_retrieval(env=Depends(get_db_environment)):
    try:
        # Pass the injected db into the pipeline
        process_retrieval(dynamodb_resource=env['db'], stage=env['stage'])
        return {"message": "retrieval pipeline completed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")

@router.get("/lga/{lga}")
def get_lga_stats(lga: str, env=Depends(get_db_environment)):
    try:
        table_name = f"lga-overall-{env['stage']}"
        table = env['db'].Table(table_name)
        response = table.get_item(Key={"lga": lga})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if "Item" not in response:
        raise HTTPException(status_code=404, detail="LGA not found")

    return response["Item"]
    
@router.get("/lga/{lga}/yearly")
def get_lga_yearly(lga: str, env=Depends(get_db_environment)):
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
    
@router.get("/lgas")
def get_all_lgas(env=Depends(get_db_environment)):
    try:
        table_name = f"lga-overall-{env['stage']}"
        table = env['db'].Table(table_name)
        response = table.scan()

        lgas = [item["lga"] for item in response.get("Items", [])]

        return {"lgas": lgas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    run_retrieval()
