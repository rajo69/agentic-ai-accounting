"""Tests for background job submission and polling."""
from fastapi.testclient import TestClient

from app.main import app


def test_jobs_routes_registered():
    client = TestClient(app)
    resp = client.get("/openapi.json")
    paths = resp.json()["paths"]
    assert "/api/v1/jobs/{job_id}" in paths
    assert "/api/v1/jobs" in paths
    assert "/api/v1/categorise/async" in paths
    assert "/api/v1/reconcile/async" in paths
    assert "/api/v1/documents/generate/async" in paths


def test_jobs_routes_require_auth():
    """All job routes should reject unauthenticated requests with 401."""
    client = TestClient(app)
    import uuid

    # GET /jobs/{id} — no auth
    resp = client.get(f"/api/v1/jobs/{uuid.uuid4()}")
    assert resp.status_code == 401

    # GET /jobs — no auth
    resp = client.get("/api/v1/jobs")
    assert resp.status_code == 401

    # POST /categorise/async — no auth
    resp = client.post("/api/v1/categorise/async")
    assert resp.status_code == 401

    # POST /reconcile/async — no auth
    resp = client.post("/api/v1/reconcile/async")
    assert resp.status_code == 401

    # POST /documents/generate/async — no auth
    resp = client.post(
        "/api/v1/documents/generate/async",
        json={"template": "management_letter", "period_start": "2026-01-01", "period_end": "2026-03-31"},
    )
    assert resp.status_code == 401
