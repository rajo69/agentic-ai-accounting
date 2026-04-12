"""Tests for the Xero webhook receiver."""
import base64
import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def _sign(payload: bytes, key: str) -> str:
    """Produce the x-xero-signature header value."""
    digest = hmac.new(key.encode(), payload, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def test_webhook_route_registered():
    client = TestClient(app)
    resp = client.get("/openapi.json")
    assert "/api/v1/webhooks/xero" in resp.json()["paths"]


def test_webhook_rejects_bad_signature():
    client = TestClient(app)
    payload = json.dumps({"events": []}).encode()
    resp = client.post(
        "/api/v1/webhooks/xero",
        content=payload,
        headers={
            "Content-Type": "application/json",
            "x-xero-signature": "bad-sig",
        },
    )
    assert resp.status_code == 401


def test_webhook_accepts_valid_signature(monkeypatch):
    monkeypatch.setattr(settings, "xero_webhook_key", "test-webhook-key-123")

    client = TestClient(app)
    payload = json.dumps({"events": []}).encode()
    sig = _sign(payload, "test-webhook-key-123")

    resp = client.post(
        "/api/v1/webhooks/xero",
        content=payload,
        headers={
            "Content-Type": "application/json",
            "x-xero-signature": sig,
        },
    )
    assert resp.status_code == 200


def test_webhook_rejects_missing_key():
    """If xero_webhook_key is empty, all webhooks are rejected."""
    client = TestClient(app)
    payload = json.dumps({"events": []}).encode()
    resp = client.post(
        "/api/v1/webhooks/xero",
        content=payload,
        headers={
            "Content-Type": "application/json",
            "x-xero-signature": "",
        },
    )
    assert resp.status_code == 401
