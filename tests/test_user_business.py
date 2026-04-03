import httpx
from util_auth import STAGING_JWT

from util_config import API_URL, TIMEOUT, RETRIEVAL_ROUTE, TIMEOUT

LGA = "RANDWICK CITY COUNCIL"

def test_ac_1():
    """AC1: Comparing the statistical and sentiment scores for an LGA"""
    print("Business Owner AC1...", end="")
    response = httpx.get(
        f"{API_URL}/{RETRIEVAL_ROUTE}/lga/{LGA}",
        headers={"Authorization": f"Bearer {STAGING_JWT}"},
        timeout=TIMEOUT
    )
    assert response.status_code == 200, "failed"
    print("success")

def test_ac_2():
    """AC2: Comparing between different LGAs"""
    print("Business Owner AC2...", end="")
    response = httpx.get(
        f"{API_URL}/{RETRIEVAL_ROUTE}/lgas",
        headers={"Authorization": f"Bearer {STAGING_JWT}"},
        timeout=TIMEOUT
    )
    assert response.status_code == 200, "failed"
    print("success")

def test_ac_3():
    """AC3: Comparing over time"""
    print("Business Owner AC3...", end="")
    response = httpx.get(
        f"{API_URL}/{RETRIEVAL_ROUTE}/lga/{LGA}/yearly",
        headers={"Authorization": f"Bearer {STAGING_JWT}"},
        timeout=TIMEOUT
    )
    assert response.status_code == 200, "failed"
    print("success")