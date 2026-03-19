from fastapi import FastAPI
from mangum import Mangum
from app.api.routes import router

app = FastAPI()
app.include_router(router, prefix="/data-collection")
handler = Mangum(app)