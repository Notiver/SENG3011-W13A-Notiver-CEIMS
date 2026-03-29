from fastapi import FastAPI
from mangum import Mangum
from app.api.routes import router
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(root_path="/data-collection")
app.include_router(router)
handler = Mangum(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
)