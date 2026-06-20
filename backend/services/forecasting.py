"""
Lightweight forecasting engine — F5

Model hierarchy (auto-selected):
  1. Holt-Winters ETS  — daily series with weekly seasonality (requires ≥14 points)
  2. Seasonal-naive    — same weekday last week (requires ≥7 points)
  3. Linear trend      — numpy polyfit degree-1 (always succeeds)

All functions return:
  {"model": str, "points": [{"ts": ISO, "predicted": float, "lower": float, "upper": float}]}
"""

from __future__ import annotations

import warnings
from datetime import datetime, timedelta, timezone

import numpy as np

MIN_HW_POINTS = 14   # 2 full weekly seasons for Holt-Winters


def forecast(
    series: list[tuple[datetime, float]],
    horizon_days: int = 7,
) -> dict:
    """
    series  — [(ts_utc, value), …] ordered ascending, daily granularity
    Returns the best-fit forecast dict.
    """
    if not series:
        return _empty(horizon_days)

    values = [float(v) for _, v in series]
    last_ts = series[-1][0]
    if last_ts.tzinfo is None:
        last_ts = last_ts.replace(tzinfo=timezone.utc)

    horizon = [last_ts + timedelta(days=i + 1) for i in range(horizon_days)]

    if len(values) >= MIN_HW_POINTS:
        try:
            result = _holt_winters(values, horizon)
            if result:
                return result
        except Exception:
            pass

    if len(values) >= 7:
        return _seasonal_naive(values, horizon)

    return _linear(values, horizon)


# ── model implementations ──────────────────────────────────────────────────────

def _holt_winters(values: list[float], horizon: list[datetime]) -> dict | None:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    arr = np.array(values, dtype=float)
    arr = np.where(arr <= 0, 0.01, arr)   # HW needs positive values

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fit = ExponentialSmoothing(
            arr,
            trend="add",
            seasonal="add",
            seasonal_periods=7,
            initialization_method="estimated",
        ).fit(optimized=True, remove_bias=True)

    preds     = fit.forecast(len(horizon))
    resid_std = float(np.std(fit.resid)) if len(fit.resid) > 1 else 0.0
    band      = 1.5 * resid_std

    points = []
    for ts, raw in zip(horizon, preds):
        pred = max(float(raw), 0.0)
        points.append({
            "ts":        ts.isoformat(),
            "predicted": round(pred, 3),
            "lower":     round(max(pred - band, 0.0), 3),
            "upper":     round(pred + band, 3),
        })
    return {"model": "holt_winters", "points": points}


def _seasonal_naive(values: list[float], horizon: list[datetime]) -> dict:
    period = 7
    points = []
    for i, ts in enumerate(horizon):
        look_back = period - (i % period)   # 1–7
        base = max(float(values[-look_back]), 0.0)
        band = base * 0.15
        points.append({
            "ts":        ts.isoformat(),
            "predicted": round(base, 3),
            "lower":     round(max(base - band, 0.0), 3),
            "upper":     round(base + band, 3),
        })
    return {"model": "seasonal_naive", "points": points}


def _linear(values: list[float], horizon: list[datetime]) -> dict:
    n     = len(values)
    x     = np.arange(n, dtype=float)
    y     = np.array(values, dtype=float)
    coeff = np.polyfit(x, y, 1)
    poly  = np.poly1d(coeff)

    points = []
    for i, ts in enumerate(horizon):
        pred = max(float(poly(n + i)), 0.0)
        band = pred * 0.20
        points.append({
            "ts":        ts.isoformat(),
            "predicted": round(pred, 3),
            "lower":     round(max(pred - band, 0.0), 3),
            "upper":     round(pred + band, 3),
        })
    return {"model": "linear", "points": points}


def _empty(horizon_days: int) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "model": "linear",
        "points": [
            {
                "ts": (now + timedelta(days=i + 1)).isoformat(),
                "predicted": 0.0,
                "lower": 0.0,
                "upper": 0.0,
            }
            for i in range(horizon_days)
        ],
    }
