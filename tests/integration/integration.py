import boto3
import json
import requests
# import pytest

client = boto3.client('lambda', region_name='ap-southeast-2')
url = "https://main.d33vns4dexnry1.amplifyapp.com/"

## NOT TESTED YET
def test_data_upload():
    # The file path relative to the root of your repo
    file_path = "../test_data/LGA_trends.xlsx"
    
    # 1. Get the Presigned URL from your API
    # (Assuming your API takes the filename to generate the link)
    route="/upload-data"
    res = requests.post(f"{url}{route}", json={"filename": "file.xlsx"})
    upload_url = res.json()["url"]

    # 2. Open the actual file from the repo and stream it to S3
    with open(file_path, "rb") as f:
        # We use a stream so we don't load all 10MB into RAM at once
        upload_res = requests.put(upload_url, data=f)

    assert upload_res.status_code == 200