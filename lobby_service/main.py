from fastapi import FastAPI
from routes import router
from middleware.timeout_middleware import TimeoutMiddleware
from middleware.logging_middleware import LoggingMiddleware
from utils.logging_config import setup_logging

import uvicorn

app = FastAPI()

logger = setup_logging()

app.include_router(router)

app.middleware("http")(TimeoutMiddleware(app, 5))

app.add_middleware(LoggingMiddleware, logger=logger)

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=9000, reload=True)
