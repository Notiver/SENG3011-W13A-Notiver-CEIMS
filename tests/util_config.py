# config for tests

API_URL = "https://hbjyijsell.execute-api.ap-southeast-2.amazonaws.com/staging"

COLLECTION_ROUTE = "data-collection"
PROCESSING_ROUTE = "data-processing"
RETRIEVAL_ROUTE = "data-retrieval"

BUCKET = "nsw-crime-data-bucket"

TIMEOUT=360 # don't make too small, data collection take a while
