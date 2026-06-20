from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Supabase connection (required, no defaults) ───────────────────────────
    database_url: str
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str
    jwks_url: str

    # ── Tariff defaults ───────────────────────────────────────────────────────
    # These are config-level fallbacks; the live tariff service (F12) overwrites
    # them in the `tariffs` table with fetched TNB/Air Selangor values.
    electricity_tariff_myr_per_kwh: float = 0.5443   # TNB blended commercial (post-Jul 2025)
    water_tariff_myr_per_m3: float = 3.51             # Air Selangor non-domestic (post-Sep 2025)
    co2e_kg_per_kwh: float = 0.574                    # Malaysia grid emission factor 2025 (Suruhanjaya Tenaga)
    tariff_region: str = "peninsular"                 # peninsular | sabah | sarawak | selangor

    # ── Anomaly detection ─────────────────────────────────────────────────────
    anomaly_zscore_threshold: float = 2.5

    # ── Forecasting ───────────────────────────────────────────────────────────
    forecast_horizon_days: int = 7
    forecast_min_points: int = 24   # minimum data points before Holt-Winters is used

    # ── Scheduling ────────────────────────────────────────────────────────────
    schedule_solver_timeout_sec: int = 5

    # ── App ───────────────────────────────────────────────────────────────────
    cors_origins: str = ""
    default_store_name: str = "Demo Retail Store"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
