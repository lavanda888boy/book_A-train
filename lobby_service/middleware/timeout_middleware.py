from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from async_timeout import timeout
import asyncio


class TimeoutMiddleware:

    def __init__(self, app: FastAPI, timeout_seconds: int = 3):
        self.app = app
        self.timeout_seconds = timeout_seconds

    async def __call__(self, request: Request, call_next):
        try:
            async with timeout(self.timeout_seconds):
                response = await call_next(request)
            return response
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=408,
                content={"detail": "Request Timeout"}
            )
