from fastapi import FastAPI
from app.api.routes import router
from mangum import Mangum

app = FastAPI(title="Notiver Retrieval API", root_path="/data-retrieval")
app.include_router(router)
handler = Mangum(app)