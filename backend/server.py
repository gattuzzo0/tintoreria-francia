from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import get_cors_extra_origins
from api.router import api_router

app = FastAPI(title="Tintorería Francia API", version="0.1.0")

# CORS debe reflejar el Origin concreto (los browsers no aceptan "*" con Authorization).
_base_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://tintoreria-francia.vercel.app",
]
_origins = list(dict.fromkeys(_base_origins + get_cors_extra_origins()))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"^https://[\w.-]+\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/")
def root():
    return {
        "service": "tintoreria-francia-api",
        "docs": "/docs",
        "corsProfile": "origins-plus-vercel-app-regex",
    }
