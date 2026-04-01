import boto3

from app import config
from fastapi import Request, Depends

def get_dynamodb_resource():
    """Function to initialize the resource."""
    try:
        session = boto3.Session(profile_name=config.PROFILE_NAME)
        return session.resource('dynamodb', region_name=config.REGION)
    except Exception:
        return boto3.resource('dynamodb', region_name=config.REGION)

def get_db_environment(request: Request, db=Depends(get_dynamodb_resource)):
    stage = request.scope.get("aws.event", {}).get("requestContext", {}).get("stage", "staging")
    
    return {
        "db": db,
        "stage": stage
    }
