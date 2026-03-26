from fastapi import FastAPI
from mangum import Mangum
from app.api.routes import router
from observability.middleware.logging_middleware import observability_middleware

app = FastAPI(root_path="/data-collection")
app.middleware("http")(observability_middleware)
app.include_router(router)
handler = Mangum(app)