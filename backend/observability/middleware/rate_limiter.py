from slowapi import Limiter
from fastapi import Request

def get_ip(request:Request):
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

limiter = Limiter(key_func=get_ip, default_limits=["100/minute"])