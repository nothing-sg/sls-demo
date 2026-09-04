from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APP_")

    stage: str = "dev"
    database_secret_arn: str = ""
    database_host: str = "localhost"
    database_port: int = 5432
    database_name: str = "app"
    cognito_user_pool_id: str = ""
    cognito_app_client_id: str = ""
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
