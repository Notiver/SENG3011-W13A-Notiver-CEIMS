import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))

if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

S3_BUCKET_NAME = "nsw-crime-data-bucket"
REGION = "ap-southeast-2"
PROFILE_NAME = "notiver"

API_URL = "https://hbjyijsell.execute-api.ap-southeast-2.amazonaws.com/".rstrip("/")
PROCESS_URL = "http://127.0.0.1:8002"
COLLECT_URL = "http://127.0.0.1:8001"
