from fastapi import FastAPI
from mangum import Mangum
from app.api.routes import router

app = FastAPI(root_path="/data-collection")
app.include_router(router)
handler = Mangum(app)