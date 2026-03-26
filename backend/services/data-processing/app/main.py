from fastapi import FastAPI
from app.api.routes import router
from mangum import Mangum
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from observability.middleware.rate_limiter import limiter
from observability.middleware.logging_middleware import observability_middleware
from aws_lambda_powertools import Metrics

metrics = Metrics(namespace="Notiver", service="data-processing")
app = FastAPI(title="Notiver NLP Processing API", root_path="/data-processing")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.middleware("http")(observability_middleware)
metrics.set_default_dimensions(service="data-processing")
app.include_router(router)
handler = Mangum(app)