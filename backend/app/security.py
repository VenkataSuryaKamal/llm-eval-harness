"""Security helpers: optional API-key auth, rate limiting, safe headers, CSV safety."""
import hmac
import time
from collections import defaultdict, deque

from fastapi import Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import get_settings


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """If APP_API_KEY is configured, every API call must present it.

    hmac.compare_digest gives a constant-time comparison (no timing leaks).
    """
    expected = get_settings().app_api_key
    if expected is None or not expected.get_secret_value():
        return
    if not x_api_key or not hmac.compare_digest(x_api_key.encode(), expected.get_secret_value().encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or invalid X-API-Key header.")


class RateLimiter:
    """Sliding-window limiter, in memory, per client IP.

    Good for a single instance. Behind several replicas use Redis or your gateway.
    """

    def __init__(self, limit_getter, message: str) -> None:
        self.limit_getter, self.message = limit_getter, message
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def __call__(self, request: Request) -> None:
        limit = self.limit_getter()
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        q = self.hits[ip]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, self.message)
        q.append(now)
        if len(self.hits) > 10_000:  # bound memory: forget idle clients
            for key in [k for k, v in self.hits.items() if not v or now - v[-1] > 60]:
                del self.hits[key]


rate_limit = RateLimiter(lambda: get_settings().rate_limit_per_minute,
                         "Too many runs. Wait a minute and try again.")
# Quick tests send one request per model, so they get their own, larger budget.
playground_rate_limit = RateLimiter(lambda: get_settings().playground_rate_limit_per_minute,
                                    "Too many quick tests. Wait a minute and try again.")


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject oversized request bodies before they are read or spooled to disk.

    Also put a limit in your reverse proxy (e.g. nginx `client_max_body_size 2m`),
    which additionally covers chunked uploads that send no Content-Length.
    """

    async def dispatch(self, request, call_next):
        limit = get_settings().max_upload_bytes * 2 + 64_000  # file + form overhead
        length = request.headers.get("content-length")
        if length is not None:
            try:
                too_big = int(length) > limit
            except ValueError:
                return JSONResponse({"detail": "Invalid Content-Length."}, status_code=400)
            if too_big:
                return JSONResponse({"detail": "Request body too large."}, status_code=413)
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cache-Control", "no-store")
        if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
            response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        return response


def csv_safe(value: object) -> str:
    """Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell)."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text
