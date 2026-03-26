import time
from fastapi import Request
from aws_lambda_powertools import Logger, Metrics
from aws_lambda_powertools.metrics import MetricUnit

logger = Logger(service="notiver")
metrics = Metrics(namespace="Notiver", service="notiver")

_start_time = time.time()

async def observability_middleware(request: Request, call_next):
    start = time.time()

    caller_ip = request.client.host if request.client else "unknown"
    endpoint = str(request.url.path)
    method = request.method

    try:
        response = await call_next(request)
        duration_ms = round((time.time() - start) * 1000, 2)

        logger.info("API request", extra={
            "endpoint": endpoint,
            "method": method,
            "caller_ip": caller_ip,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "uptime_seconds": round(time.time() - _start_time, 2)
        })

        metrics.add_metric("APIRequests", MetricUnit.Count, 1)
        metrics.add_metric("Latency", MetricUnit.Milliseconds, duration_ms)

        if duration_ms > 5000:
            logger.warning("Slow response detected", extra={
                "endpoint": endpoint,
                "duration_ms": duration_ms
            })
            metrics.add_metric("SlowResponses", MetricUnit.Count, 1)

        if response.status_code >= 400:
            logger.warning("Error response", extra={
                "endpoint": endpoint,
                "status_code": response.status_code,
                "caller_ip": caller_ip
            })
            metrics.add_metric("Errors", MetricUnit.Count, 1)

        metrics.flush_metrics()
        return response

    except Exception as e:
        logger.error("Unhandled exception", extra={
            "endpoint": endpoint,
            "caller_ip": caller_ip,
            "error": str(e)
        })

        metrics.add_metric("Errors", MetricUnit.Count, 1)
        metrics.flush_metrics()

        raise