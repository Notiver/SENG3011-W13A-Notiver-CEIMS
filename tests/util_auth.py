import boto3
from dotenv import load_dotenv
import os

load_dotenv()

AUTH_PARAMETERS={
    "USERNAME": os.environ["TEST_USER_EMAIL"],
    "PASSWORD": os.environ["TEST_USER_PASSWORD"],
    "CLIENT_ID": os.environ["COGNITO_CLIENT_ID"] 
}

def get_staging_jwt():
    client = boto3.client("cognito-idp", region_name="ap-southeast-2")
    response = client.initiate_auth(
        AuthFlow="USER_PASSWORD_AUTH",
        AuthParameters={
            "USERNAME": AUTH_PARAMETERS["USERNAME"],
            "PASSWORD": AUTH_PARAMETERS["PASSWORD"],
        },
        ClientId=AUTH_PARAMETERS["CLIENT_ID"],
    )
    return response["AuthenticationResult"]["IdToken"]

STAGING_JWT = get_staging_jwt()