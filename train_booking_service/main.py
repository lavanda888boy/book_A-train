from fastapi import FastAPI
from routes import router
from middleware.timeout_middleware import TimeoutMiddleware

import uvicorn

app = FastAPI()

app.include_router(router)

app.middleware("http")(TimeoutMiddleware(app, 5))

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)