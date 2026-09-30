import logging
import uuid
from contextvars import ContextVar
from time import perf_counter

from starlette.responses import JSONResponse

request_id = ContextVar("request_id", default="startup")


def error_response(status, code, message):
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "requestId": request_id.get()}},
    )


class ContextFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_id.get()
        return True


def configure_logging():
    handler = logging.StreamHandler()
    handler.addFilter(ContextFilter())
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s request_id=%(request_id)s %(message)s")
    )
    logger = logging.getLogger("app")
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logging.getLogger("httpx").setLevel(logging.WARNING)


class RequestMiddleware:
    def __init__(self, app, max_bytes):
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        token = request_id.set(str(uuid.uuid4()))
        start = perf_counter()
        status = 500
        started = False

        async def send_response(message):
            nonlocal status, started
            if message["type"] == "http.response.start":
                status = message["status"]
                started = True
                message["headers"].append((b"x-request-id", request_id.get().encode()))
            await send(message)

        try:
            # Bound actual received bytes, including chunked requests without Content-Length.
            body = bytearray()
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body.extend(message.get("body", b""))
                if len(body) > self.max_bytes:
                    return await error_response(
                        413, "request_too_large", "Request body exceeds configured limit"
                    )(scope, receive, send_response)
                if not message.get("more_body", False):
                    break
            delivered = False

            async def replay():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()

            try:
                await self.app(scope, replay, send_response)
            except Exception as error:
                # Handle inside the request context, without logging exception text or traces.
                logging.getLogger("app.http").error("request_failed type=%s", type(error).__name__)
                if not started:
                    await error_response(500, "internal_error", "Unable to complete this request")(
                        scope, replay, send_response
                    )
        finally:
            route = scope.get("route")
            logging.getLogger("app.http").info(
                "request method=%s endpoint=%s status=%s duration_ms=%.2f",
                scope["method"],
                getattr(route, "path", "unmatched"),
                status,
                (perf_counter() - start) * 1000,
            )
            request_id.reset(token)
