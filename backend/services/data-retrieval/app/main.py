from fastapi import FastAPI
from app.api.routes import router
from mangum import Mangum
from observability.middleware.logging_middleware import observability_middleware

app = FastAPI(title="Notiver Retrieval API", root_path="/data-retrieval")
app.middleware("http")(observability_middleware)
app.include_router(router)
handler = Mangum(app)