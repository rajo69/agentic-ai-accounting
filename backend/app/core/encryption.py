"""Symmetric encryption for sensitive fields (Xero OAuth tokens)."""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

# Derive a stable 32-byte Fernet key from the app's secret_key.
_raw = hashlib.sha256(settings.secret_key.encode()).digest()
_fernet_key = base64.urlsafe_b64encode(_raw)
_fernet = Fernet(_fernet_key)

# Prefix so we can tell encrypted values from legacy plaintext.
_PREFIX = "enc::"


def encrypt(plaintext: str) -> str:
    """Encrypt a string. Returns a prefixed ciphertext."""
    token = _fernet.encrypt(plaintext.encode())
    return _PREFIX + token.decode()


def decrypt(stored: str) -> str:
    """Decrypt a value. Handles both encrypted and legacy plaintext gracefully."""
    if not stored:
        return stored
    if not stored.startswith(_PREFIX):
        # Legacy plaintext — return as-is so existing tokens keep working.
        return stored
    try:
        return _fernet.decrypt(stored[len(_PREFIX):].encode()).decode()
    except InvalidToken:
        # If the secret_key changed, we can't decrypt. Return empty to
        # force a token refresh on the next Xero call.
        return ""
