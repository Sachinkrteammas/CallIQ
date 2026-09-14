import json
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Call Audit SaaS"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    debug: bool = True

    secret_key: str = Field(default="change-me", alias="SECRET_KEY")
    webhook_secret_key: str = Field(
        default="webhook-secret-key",
        alias="WEBHOOK_SECRET_KEY"
    )
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    mysql_user: str = "root"
    mysql_password: str = "root"
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_db: str = "call_audit"

    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    cors_origins: str = "http://localhost:5173"

    # Deepgram STT
    stt_api_url: str = Field(default="https://api.deepgram.com/v1/listen", alias="STT_API_URL")
    stt_api_key: str = Field(default="", alias="STT_API_KEY")
    stt_mock_enabled: bool = Field(default=False, alias="STT_MOCK_ENABLED")
    stt_model: str = Field(default="nova", alias="STT_MODEL")
    stt_language: str = Field(default="hi-Latn", alias="STT_LANGUAGE")

    # LLM / OpenAI
    llm_api_url: str = Field(default="https://llm.example.com/audit", alias="LLM_API_URL")
    llm_api_key: str = Field(default="", alias="LLM_API_KEY")
    llm_mock_enabled: bool = Field(default=False, alias="LLM_MOCK_ENABLED")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4o", alias="OPENAI_MODEL")

    sql_db_url2: str = Field(default="", alias="SQL_DB_URL2")
    sql_db_url3: str = Field(default="", alias="SQL_DB_URL3")

    @property
    def cors_origins_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        if not raw:
            return []
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            except json.JSONDecodeError:
                pass
        return [item.strip() for item in raw.split(",") if item.strip()]

    @property
    def sqlalchemy_database_uri(self) -> str:
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_db}"
        )

    @property
    def sqlalchemy_database_uri2(self) -> str:
        return self.sql_db_url2

    @property
    def sqlalchemy_database_uri3(self) -> str:
        return self.sql_db_url3


@lru_cache
def get_settings() -> Settings:
    return Settings()
