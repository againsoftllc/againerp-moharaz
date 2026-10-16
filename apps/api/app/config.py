from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AgainERP API"
    app_env: str = "development"
    app_debug: bool = True

    database_url: str = "postgresql+psycopg://againerp:againerp@127.0.0.1:5440/againerp"

    api_host: str = "127.0.0.1"
    api_port: int = 8010
    api_reload: bool = True

    cors_origins: str = (
        "http://localhost:3210,http://127.0.0.1:3210,"
        "http://localhost:3010,http://127.0.0.1:3010,"
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001"
    )

    cloudflare_oauth_client_id: str = ""
    cloudflare_oauth_client_secret: str = ""
    cloudflare_oauth_redirect_uri: str = "http://127.0.0.1:8010/api/v1/plugins/cloudflare/oauth/callback"
    cloudflare_oauth_scopes: str = "account-settings.read workers-r2.write images.write"
    cloudflare_oauth_success_redirect: str = "http://localhost:3210/settings/plugins/cloudflare"

    # Cloudflare Tunnel — public HTTPS front for local OAuth callbacks
    # (Alibaba, Amazon SP-API, Google, Facebook, Microsoft, …)
    cloudflare_tunnel_enabled: bool = False
    cloudflare_tunnel_url: str = ""
    cloudflare_tunnel_local_host: str = "127.0.0.1"
    cloudflare_tunnel_local_port: int = 8010

    # Alibaba.com OAuth (GGS-ISV) — callback prepared; token exchange later
    alibaba_oauth_app_key: str = ""
    alibaba_oauth_app_secret: str = ""
    alibaba_oauth_redirect_uri: str = (
        "http://127.0.0.1:8010/api/v1/plugins/alibaba/oauth/callback"
    )
    alibaba_oauth_success_redirect: str = "http://localhost:3210/catalog/import"

    storefront_base_url: str = "http://localhost:3210"
    # Shopper-facing website (payment result redirects land here)
    storefront_public_url: str = "http://localhost:3010"
    # Public base of this API for gateway callbacks; empty = derive from request
    public_api_base_url: str = ""
    seo_audit_live_crawl: bool = True
    seo_audit_crawl_max_pages: int = 30
    seo_audit_crawl_timeout: float = 8.0

    # Elim product import (Taobao / 1688)
    elim_api_key: str = ""
    elim_base_url: str = "https://openapi.elim.asia"

    # Amazon SP-API (Againsoft) — LWA + Selling Partner API
    amazon_sp_client_id: str = ""
    amazon_sp_client_secret: str = ""
    amazon_sp_refresh_token: str = ""
    amazon_sp_solution_id: str = ""
    amazon_sp_app_name: str = "Againsoft"
    amazon_sp_env: str = "sandbox"  # sandbox | production
    amazon_sp_region: str = "na"  # na | eu | fe
    amazon_sp_marketplace_id: str = "ATVPDKIKX0DER"

    # Dropship pricing: sell = (cost_cny × rate) × (1 + markup%/100) + profit + server_fee
    dropship_cny_to_bdt: float = 16.0
    dropship_markup_percent: float = 30.0
    dropship_default_profit_bdt: float = 0.0
    dropship_default_server_fee_bdt: float = 0.0

    # Amazon import pricing (USD → BDT)
    amazon_usd_to_bdt: float = 110.0
    amazon_default_cost_usd: float = 10.0

    # AI catalog import (product-from-URL) — direct Anthropic call, no
    # platform gateway. Empty key = feature returns a clear 501, not a crash.
    anthropic_api_key: str = ""
    ai_catalog_import_model: str = "claude-sonnet-5"

    # AI OS — provider abstraction (docs/AI_OS_INTEGRATION_AUDIT.md).
    # "claude" talks to Anthropic directly with anthropic_api_key above;
    # "center" talks to AgainERP Center's /agent/v1/conversation using the
    # fleet-bind settings below. Empty key = provider reports unhealthy,
    # not a crash — same fallback shape as ai_catalog_import already uses.
    ai_default_provider: str = "openai"
    ai_default_model: str = "claude-opus-5"

    # "openai" is the engine behind Aladin. The key normally lives in the workspace
    # (AI → Settings → ai_api_connections); this env var is the deployment-wide fallback.
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = ""

    # AgainERP Center fleet binding (storefront feature flags / entitlements)
    againerp_center_url: str = ""
    againerp_client_id: str = ""
    againerp_client_api_key: str = ""
    againerp_client_slug: str = ""
    againerp_entitlements_cache_ttl_seconds: int = 60

    # SaaS: multi-tenant company registration + super-admin bootstrap
    trial_days: int = 14
    super_admin_email: str = "superadmin@againerp.local"
    super_admin_username: str = "superadmin"
    super_admin_password: str = "changeme123"
    super_admin_name: str = "AgainERP Super Admin"

    @model_validator(mode="after")
    def normalize_database_url(self) -> "Settings":
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        # Railway public proxy requires SSL; internal *.railway.internal does not
        if ".railway.app" in url and "sslmode=" not in url:
            url += "&sslmode=require" if "?" in url else "?sslmode=require"
        object.__setattr__(self, "database_url", url)
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
