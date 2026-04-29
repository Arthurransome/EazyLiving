from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # postgres
    DATABASE_URL: str
    # Optional separate DB for pytest. If unset, tests share the main DB.
    TEST_DATABASE_URL: str = ""

    # dev vs prod
    DB_ECHO: bool = False

    # redis
    REDIS_URL: str

    # mongodb
    MONGO_URL: str
    MONGO_DB: str

    # jwt
    JWT_SECRET: str
    JWT_ALGORITHM: str
    JWT_EXPIRE_MINUTES: int

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()