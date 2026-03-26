from fastapi import FastAPI
from app.api.routes import router
from mangum import Mangum
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="Notiver Retrieval API", root_path="/data-retrieval")
app.include_router(router)
handler = Mangum(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
)