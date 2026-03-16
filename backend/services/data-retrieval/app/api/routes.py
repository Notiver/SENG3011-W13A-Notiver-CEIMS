from fastapi import APIRouter, HTTPException
from app.services.retriever import run_nlp_pipeline, fetch_processed_data

router = APIRouter()

@router.get("/")
def root():
    return {"message": "Data Retrieval Service is running"}

@router.post("/run-retrieval")
def run_retrieval():
    try:
        process_retrieval()
        return {"message": "retrieval pipeline completed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")

@router.get("/lga/{lga}")
def get_lga_stats(lga: str):
    try:
        response = lga_overall_table.get_item(Key={"lga": lga})

        if "Item" not in response:
            raise HTTPException(status_code=404, detail="LGA not found")

        return response["Item"]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/lga/{lga}/yearly")
def get_lga_yearly(lga: str):
    try:
        response = lga_by_year_table.query(
            KeyConditionExpression="lga = :lga",
            ExpressionAttributeValues={":lga": lga}
        )

        return response["Items"]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))