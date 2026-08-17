import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BASE_DIR.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(*names: str, default: bool = False) -> bool:
    for name in names:
        value = os.getenv(name)
        if value is not None:
            return value.strip().lower() in {"1", "true", "yes", "on"}
    return default


def env_value(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name)
        if value is not None:
            return value
    return default


class Settings:
    app_name = os.getenv("APP_NAME", "Control de Acceso al Centro de Datos")
    app_host = os.getenv("APP_HOST", "0.0.0.0")
    app_port = int(os.getenv("APP_PORT", "8065"))
    secret_key = os.getenv("SECRET_KEY", "dev-secret-change-me")

    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "5432")
    db_name = os.getenv("DB_NAME", "cacd-dp")
    db_user = os.getenv("DB_USER", "postgres")
    db_password = os.getenv("DB_PASSWORD", "1234")

    ad_host = env_value("AD_HOST", "app.ad.host", default="localhost")
    ad_port = env_value("AD_PORT", "app.ad.port", default="389")
    ad_domain = env_value("AD_DOMAIN", "app.ad.domain", "LDAP_DOMAIN", default="")
    ad_search_user_base = env_value("AD_SEARCH_USER_BASE", "app.ad.search-user-base", "LDAP_BASE_DN", default="")
    ad_search_group_base = env_value("AD_SEARCH_GROUP_BASE", "app.ad.search-group-base", default="")
    ad_secure_ldap = env_bool("AD_SECURE_LDAP", "app.ad.secure-ldap", default=False)
    ad_security_protocol = env_value("AD_SECURITY_PROTOCOL", "app.ad.security-protocol", default="ssl")
    ad_validation_enabled = env_bool("AD_VALIDATION_ENABLED", "app.ad.validation-enabled", "LDAP_ENABLED", default=False)
    ad_show_exceptions = env_bool("AD_SHOW_EXCEPTIONS", "app.ad.show-exceptions", default=False)

    ldap_enabled = ad_validation_enabled
    ldap_server = env_value("LDAP_SERVER", default="")
    ldap_domain = ad_domain
    ldap_base_dn = ad_search_user_base

    @property
    def ad_url(self) -> str:
        if self.ldap_server:
            return self.ldap_server
        scheme = "ldaps" if self.ad_secure_ldap else "ldap"
        return f"{scheme}://{self.ad_host}:{self.ad_port}"

    @property
    def database_url(self) -> str:
        return (
            f"host={self.db_host} port={self.db_port} dbname={self.db_name} "
            f"user={self.db_user} password={self.db_password}"
        )

    @property
    def database_kwargs(self) -> dict:
        return {
            "host": self.db_host,
            "port": int(self.db_port),
            "dbname": self.db_name,
            "user": self.db_user,
            "password": self.db_password,
        }


settings = Settings()
