from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    app_env: Literal["development", "test", "production"] = "development"
    host: str = "0.0.0.0"
    port: int = 8000
    database_url: SecretStr = SecretStr("")
    database_ssl: bool = False
    database_ssl_ca_file: str = ""
    database_pool_size: int = Field(default=5, ge=1, le=20)
    category_model_path: str = ""
    priority_model_path: str = ""
    location_model_path: str = ""
    model_device: Literal["cpu", "cuda"] = "cpu"
    inference_mode: Literal["real", "disabled"] = "real"
    inference_max_concurrency: int = Field(default=1, ge=1, le=8)
    inference_queue_timeout_seconds: float = Field(default=30, gt=0)
    classification_max_tokens: int = Field(default=128, ge=16, le=512)
    location_max_tokens: int = Field(default=128, ge=16, le=512)
    llm_enabled: bool = False
    llm_api_key: SecretStr = SecretStr("")
    llm_model: str = ""
    llm_base_url: str = ""
    llm_timeout_seconds: float = Field(default=15, gt=0, le=120)
    cors_origins: str = "http://localhost:5173"
    model_evaluation_json: str = ""
    reports_timezone: str = "Africa/Tripoli"
    analysis_signing_key: SecretStr = SecretStr("")
    analysis_token_ttl_seconds: int = Field(default=86400, ge=60)
    request_max_bytes: int = Field(default=262144, ge=1024)

    @model_validator(mode="after")
    def validate_configuration(self):
        if self.app_env == "production":
            if self.inference_mode != "real":
                raise ValueError("Production requires INFERENCE_MODE=real")
            if len(self.analysis_signing_key.get_secret_value()) < 32:
                raise ValueError(
                    "Production requires ANALYSIS_SIGNING_KEY of at least 32 characters"
                )
        if "*" in self.allowed_origins:
            raise ValueError("CORS_ORIGINS must contain explicit origins")
        return self

    @property
    def allowed_origins(self) -> list[str]:
        return [
            origin.strip().rstrip("/") for origin in self.cors_origins.split(",") if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
