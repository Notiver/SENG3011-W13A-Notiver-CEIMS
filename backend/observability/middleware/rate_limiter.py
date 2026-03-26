from slowapi import Limiter
from fastapi import Request

def get_ip(request:Request):
    return request.headers.get("x-forwarded-for", "unknown")

limiter = Limiter(key_func=get_ip, default_limits=["100/minute"])