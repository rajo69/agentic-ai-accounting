"""Tests for token encryption/decryption."""
from app.core.encryption import encrypt, decrypt


def test_encrypt_decrypt_roundtrip():
    original = "xero_access_token_abc123"
    encrypted = encrypt(original)
    assert encrypted != original
    assert encrypted.startswith("enc::")
    assert decrypt(encrypted) == original


def test_decrypt_legacy_plaintext():
    """Existing unencrypted tokens should pass through unchanged."""
    legacy = "tok_access_plain"
    assert decrypt(legacy) == legacy


def test_decrypt_empty_string():
    assert decrypt("") == ""


def test_decrypt_none():
    assert decrypt(None) is None


def test_different_inputs_produce_different_ciphertexts():
    a = encrypt("token_a")
    b = encrypt("token_b")
    assert a != b
