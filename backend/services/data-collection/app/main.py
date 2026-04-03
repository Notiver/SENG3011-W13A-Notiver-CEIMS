import os

from fastapi import FastAPI
from app.api.routes import router
from mangum import Mangum
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from observability.middleware.rate_limiter import limiter
from observability.middleware.logging_middleware import observability_middleware
from aws_lambda_powertools import Metrics, Tracer
from aws_xray_sdk.core import patch_all
# from fastapi.middleware.cors import CORSMiddleware

patch_all()
tracer = Tracer(service="data-collection")
metrics = Metrics(namespace="Notiver", service="data-collection")
app = FastAPI(title="Notiver Collection API")

# metrics.set_default_dimensions(service="data-collection")

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=[
#       "https://main.d2exnodyaugt1a.amplifyapp.com",
#       "https://staging.d2exnodyaugt1a.amplifyapp.com",
#       "http://localhost:3000"
#     ],
#     allow_credentials=True,
#     allow_methods=["*"], 
#     allow_headers=["*"], 
# )

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.middleware("http")(observability_middleware)

app.include_router(router)
stage = os.getenv("STAGE", "staging")
_mangum_handler = Mangum(app, lifespan="off", api_gateway_base_path=f"/{stage}/data-collection")

@tracer.capture_lambda_handler
def handler(event, context):
    stage = os.getenv("STAGE", "staging")
    _mangum_handler = Mangum(app, lifespan="off", api_gateway_base_path=f"/{stage}/data-collection")
    return _mangum_handler(event, context)
