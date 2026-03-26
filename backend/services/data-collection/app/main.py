from fastapi import FastAPI
from mangum import Mangum
from app.api.routes import router
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from observability.middleware.rate_limiter import limiter
from observability.middleware.logging_middleware import observability_middleware
from aws_lambda_powertools import Metrics

metrics = Metrics(namespace="Notiver", service="data-collection")
app = FastAPI(root_path="/data-collection")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.middleware("http")(observability_middleware)
metrics.set_default_dimensions(service="data-collection")
app.include_router(router)
handler = Mangum(app)