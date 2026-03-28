from fastapi import FastAPI
from app.api.routes import router
from mangum import Mangum
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Notiver Retrieval API", root_path="/data-retrieval")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
      "https://main.d2exnodyaugt1a.amplifyapp.com",
      "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
)

app.include_router(router)
handler = Mangum(app)
