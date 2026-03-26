from fastapi import FastAPI
from mangum import Mangum
from app.api.routes import router
from observability.middleware.logging_middleware import observability_middleware

app = FastAPI(root_path="/data-collection")
app.middleware("http")(observability_middleware)
metrics.set_default_dimensions(service="data-collection")
app.include_router(router)
handler = Mangum(app)