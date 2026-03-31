from fastapi import FastAPI
from app.api.routes import router
from mangum import Mangum
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from observability.middleware.rate_limiter import limiter
from observability.middleware.logging_middleware import observability_middleware
from aws_lambda_powertools import Metrics, Tracer
from fastapi.middleware.cors import CORSMiddleware

tracer = Tracer(service="data-retrieval")
metrics = Metrics(namespace="Notiver", service="data-retrieval")
app = FastAPI(title="Notiver Retrieval API", root_path="/data-retrieval")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.middleware("http")(observability_middleware)
metrics.set_default_dimensions(service="data-retrieval")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
      "https://main.d2exnodyaugt1a.amplifyapp.com",
      "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
)

app.include_router(router)
_mangum_handler = Mangum(app)

@tracer.capture_lambda_handler
def handler(event, context):
    return _mangum_handler(event, context)
