import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import json


class LoggingMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, logger: logging.Logger):
        super().__init__(app)
        self.logger = logger
        self.service_name = "lobby_service"

    async def dispatch(self, request: Request, call_next):
        request_log = json.dumps({
            "service": self.service_name,
            "event": "request",
            "method": request.method,
            "url": str(request.url),
        })
        self.logger.info(request_log)

        response: Response = await call_next(request)

        response_log = json.dumps({
            "service": self.service_name,
            "event": "response",
            "status_code": response.status_code,
            "method": request.method,
            "url": str(request.url),
        })
        self.logger.info(response_log)

        return response
