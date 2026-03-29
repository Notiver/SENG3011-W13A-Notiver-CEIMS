from fastapi import APIRouter, HTTPException, Depends
from app.services.retriever import process_retrieval, get_dynamodb_resource

router = APIRouter()

@router.get("/")
def root():
    return {"message": "Data Retrieval Service is running"}
@router.post("/run-retrieval")
def run_retrieval(db=Depends(get_dynamodb_resource)):
    try:
        # Pass the injected db into the pipeline
        process_retrieval(dynamodb_resource=db)
        return {"message": "retrieval pipeline completed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")

@router.get("/lga/{lga}")
def get_lga_stats(lga: str, db=Depends(get_dynamodb_resource)):
    try:
        table = db.Table('lga-overall')
        response = table.get_item(Key={"lga": lga})

        if "Item" not in response:
            raise HTTPException(status_code=404, detail="LGA not found")

        return response["Item"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/lga/{lga}/yearly")
def get_lga_yearly(lga: str, db=Depends(get_dynamodb_resource)):
    try:
        table = db.Table('lga-by-year')
        response = table.query(
            KeyConditionExpression="lga = :lga",
            ExpressionAttributeValues={":lga": lga}
        )
        return response["Items"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/lgas")
def get_all_lgas(db=Depends(get_dynamodb_resource)):
    try:
        table = db.Table('lga-overall')
        response = table.scan()

        lgas = [item["lga"] for item in response.get("Items", [])]

        return {"lgas": lgas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    