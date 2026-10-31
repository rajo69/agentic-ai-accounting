from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    database_url: str = "postgresql+asyncpg://aiaccountant:localdev123@localhost:5432/aiaccountant"
    database_url_sync: str = "postgresql://aiaccountant:localdev123@localhost:5432/aiaccountant"
    redis_url: str = "redis://localhost:6379"
    secret_key: str = "change-me-in-production"
    xero_client_id: str = ""
    xero_client_secret: str = ""
    xero_redirect_uri: str = "http://localhost:8000/auth/xero/callback"
    anthropic_api_key: str = ""
    # Model set for every Claude call (app/services/llm_client.py PROFILES); set to claude-4 to roll back.
    # A Literal so a typo fails at startup, not on the first Claude call.
    llm_profile: Literal["claude-4", "claude-5-5"] = "claude-4"
    frontend_url: str = "http://localhost:3000"
    xero_webhook_key: str = ""
    sentry_dsn: str = ""
    environment: str = "development"
    resend_api_key: str = ""
    email_from: str = "AI Accountant <noreply@example.com>"


settings = Settings()
