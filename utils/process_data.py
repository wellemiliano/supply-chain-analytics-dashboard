from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any
import unicodedata
import xml.etree.ElementTree as ET

import pandas as pd


DATE_COLUMNS = [
    "order_date",
    "expected_delivery_date",
    "actual_delivery_date",
]

NUMERIC_COLUMNS = [
    "record_id",
    "quantity_ordered",
    "quantity_delivered",
    "demand_forecast",
    "demand_actual",
    "initial_stock",
    "final_stock",
    "sales_period",
    "lead_time_expected_days",
    "lead_time_actual_days",
    "waste_percent",
    "unit_cost_eur",
    "total_cost_eur",
]

FILTER_COLUMNS = ["region", "warehouse", "supplier", "category", "product"]


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _safe_float(value: Any, decimals: int = 2) -> float:
    if pd.isna(value):
        return 0.0
    return round(float(value), decimals)


def _parse_xml_records(xml_path: Path) -> pd.DataFrame:
    root = ET.parse(xml_path).getroot()
    records_node = root.find("records")
    if records_node is None:
        raise ValueError("Tag <records> não encontrada no XML.")

    rows = []
    for record in records_node.findall("record"):
        rows.append({child.tag: (child.text or "").strip() for child in record})

    if not rows:
        raise ValueError("Nenhum registo encontrado dentro de <records>.")
    return pd.DataFrame(rows)


def _yes_no_to_bool(series: pd.Series) -> pd.Series:
    true_tokens = {"sim", "yes", "true", "1", "y", "s"}

    def convert(value: Any) -> bool:
        normalized = _strip_accents(str(value).strip().lower())
        return normalized in true_tokens

    return series.apply(convert).astype(bool)


def _normalize_filter_values(values: Any) -> list[str]:
    if values is None:
        return []

    if isinstance(values, str):
        tokens = values.split(",")
    elif isinstance(values, list):
        tokens = []
        for item in values:
            tokens.extend(str(item).split(","))
    else:
        tokens = [str(values)]

    clean = []
    for token in tokens:
        normalized = token.strip()
        if normalized and normalized.lower() not in {"all", "todos"}:
            clean.append(normalized)
    return clean


def load_and_prepare_data(xml_path: Path) -> pd.DataFrame:
    df = _parse_xml_records(xml_path)

    for col in DATE_COLUMNS:
        df[col] = pd.to_datetime(df[col], errors="coerce")

    for col in NUMERIC_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    for col in FILTER_COLUMNS + ["delivery_status", "stockout", "on_time_delivery"]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()

    df = df.dropna(subset=["order_date"]).copy()
    df["order_month"] = df["order_date"].dt.to_period("M").astype(str)
    df["stockout_flag"] = _yes_no_to_bool(df["stockout"])
    df["on_time_flag"] = _yes_no_to_bool(df["on_time_delivery"])
    df["lead_time_delay_days"] = (
        df["lead_time_actual_days"] - df["lead_time_expected_days"]
    ).clip(lower=0)
    df["delivery_delay_days"] = (
        df["actual_delivery_date"] - df["expected_delivery_date"]
    ).dt.days.fillna(0).clip(lower=0)
    df["forecast_abs_error"] = (df["demand_actual"] - df["demand_forecast"]).abs()
    forecast_denominator = df["demand_forecast"].where(
        df["demand_forecast"] != 0, other=float("nan")
    )
    df["forecast_accuracy"] = (
        1 - (df["forecast_abs_error"] / forecast_denominator)
    ).clip(lower=0, upper=1)
    df["forecast_accuracy"] = df["forecast_accuracy"].fillna(0)

    demand_denominator = df["demand_actual"].where(
        df["demand_actual"] != 0, other=float("nan")
    )
    df["stock_coverage_ratio"] = (df["final_stock"] / demand_denominator).fillna(0)
    df["stock_gap_units"] = (df["quantity_ordered"] - df["quantity_delivered"]).clip(
        lower=0
    )
    df["total_cost_eur"] = df["total_cost_eur"].where(
        df["total_cost_eur"] > 0, df["quantity_delivered"] * df["unit_cost_eur"]
    )
    df["waste_cost_eur"] = df["total_cost_eur"] * (df["waste_percent"] / 100.0)

    return df


def get_filter_options(df: pd.DataFrame) -> dict[str, Any]:
    return {
        "min_date": df["order_date"].min().strftime("%Y-%m-%d"),
        "max_date": df["order_date"].max().strftime("%Y-%m-%d"),
        "regions": sorted(df["region"].dropna().unique().tolist()),
        "warehouses": sorted(df["warehouse"].dropna().unique().tolist()),
        "suppliers": sorted(df["supplier"].dropna().unique().tolist()),
        "categories": sorted(df["category"].dropna().unique().tolist()),
        "products": sorted(df["product"].dropna().unique().tolist()),
    }


def apply_filters(df: pd.DataFrame, filters: dict[str, Any]) -> pd.DataFrame:
    filtered = df.copy()

    start_date = pd.to_datetime(filters.get("start_date"), errors="coerce")
    end_date = pd.to_datetime(filters.get("end_date"), errors="coerce")

    if not pd.isna(start_date):
        filtered = filtered[filtered["order_date"] >= start_date]
    if not pd.isna(end_date):
        filtered = filtered[filtered["order_date"] <= end_date]

    for column in FILTER_COLUMNS:
        selected = _normalize_filter_values(filters.get(column))
        if selected:
            filtered = filtered[filtered[column].isin(selected)]

    return filtered


def _empty_payload() -> dict[str, Any]:
    return {
        "record_count": 0,
        "period_start": "",
        "period_end": "",
        "kpis": {
            "total_inventory": 0.0,
            "avg_lead_time_days": 0.0,
            "stockout_rate": 0.0,
            "on_time_rate": 0.0,
            "avg_waste_percent": 0.0,
            "forecast_accuracy_rate": 0.0,
            "avg_stock_coverage": 0.0,
            "total_cost_eur": 0.0,
        },
        "charts": {
            "monthly_performance": {
                "labels": [],
                "avg_lead_time_days": [],
                "stockout_rate": [],
                "on_time_rate": [],
            },
            "stockout_by_category": {"labels": [], "values": []},
            "top_products_stockout": {"labels": [], "values": [], "counts": []},
            "on_time_delivery_split": {"labels": ["No Prazo", "Atrasadas"], "values": [0, 0]},
            "supplier_delay": {"labels": [], "values": []},
            "forecast_vs_actual": {"labels": [], "forecast": [], "actual": []},
            "waste_by_category": {"labels": [], "values": []},
            "cost_by_supplier": {"labels": [], "values": []},
            "region_performance": [],
            "top_regions_delay": {"labels": [], "values": []},
        },
        "insights": ["Nenhum registo encontrado para os filtros aplicados."],
        "table_rows": [],
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def compute_dashboard_payload(df: pd.DataFrame) -> dict[str, Any]:
    if df.empty:
        return _empty_payload()

    total_orders = len(df)
    period_start = df["order_date"].min().strftime("%Y-%m-%d")
    period_end = df["order_date"].max().strftime("%Y-%m-%d")
    kpis = {
        "total_inventory": _safe_float(df["final_stock"].sum()),
        "avg_lead_time_days": _safe_float(df["lead_time_actual_days"].mean()),
        "stockout_rate": _safe_float(df["stockout_flag"].mean() * 100),
        "on_time_rate": _safe_float(df["on_time_flag"].mean() * 100),
        "avg_waste_percent": _safe_float(df["waste_percent"].mean()),
        "forecast_accuracy_rate": _safe_float(df["forecast_accuracy"].mean() * 100),
        "avg_stock_coverage": _safe_float(df["stock_coverage_ratio"].mean(), 3),
        "total_cost_eur": _safe_float(df["total_cost_eur"].sum()),
    }

    monthly_performance = (
        df.groupby("order_month", as_index=False)
        .agg(
            avg_lead_time_days=("lead_time_actual_days", "mean"),
            stockout_rate=("stockout_flag", "mean"),
            on_time_rate=("on_time_flag", "mean"),
        )
        .sort_values("order_month")
    )

    stockout_by_category = (
        df.groupby("category", as_index=False)
        .agg(stockout_rate=("stockout_flag", "mean"), orders=("order_id", "count"))
        .sort_values(["stockout_rate", "orders"], ascending=[False, False])
    )

    top_products_stockout = (
        df.groupby("product", as_index=False)
        .agg(
            stockout_rate=("stockout_flag", "mean"),
            stockout_count=("stockout_flag", "sum"),
            orders=("order_id", "count"),
        )
        .sort_values(["stockout_rate", "stockout_count"], ascending=[False, False])
        .head(10)
    )

    supplier_delay = (
        df.groupby("supplier", as_index=False)
        .agg(avg_delay_days=("lead_time_delay_days", "mean"))
        .sort_values("avg_delay_days", ascending=False)
    )

    forecast_vs_actual = (
        df.groupby("order_month", as_index=False)
        .agg(forecast=("demand_forecast", "sum"), actual=("demand_actual", "sum"))
        .sort_values("order_month")
    )

    waste_by_category = (
        df.groupby("category", as_index=False)
        .agg(avg_waste_percent=("waste_percent", "mean"))
        .sort_values("avg_waste_percent", ascending=False)
    )

    cost_by_supplier = (
        df.groupby("supplier", as_index=False)
        .agg(total_cost=("total_cost_eur", "sum"))
        .sort_values("total_cost", ascending=False)
    )

    region_performance = (
        df.groupby("region", as_index=False)
        .agg(
            avg_lead_time_days=("lead_time_actual_days", "mean"),
            avg_delay_days=("lead_time_delay_days", "mean"),
            on_time_rate=("on_time_flag", "mean"),
            stockout_rate=("stockout_flag", "mean"),
            avg_waste_percent=("waste_percent", "mean"),
        )
        .sort_values("avg_delay_days", ascending=False)
    )

    top_regions_delay = region_performance.nlargest(5, "avg_delay_days")

    forecast_accuracy_by_category = (
        df.groupby("category", as_index=False)
        .agg(forecast_accuracy=("forecast_accuracy", "mean"))
        .sort_values("forecast_accuracy", ascending=True)
    )

    insights = []
    highest_stockout_category = stockout_by_category.iloc[0]
    insights.append(
        f"A categoria {highest_stockout_category['category']} apresenta a maior taxa de ruptura "
        f"({highest_stockout_category['stockout_rate'] * 100:.1f}%)."
    )

    highest_delay_supplier = supplier_delay.iloc[0]
    insights.append(
        f"O fornecedor {highest_delay_supplier['supplier']} tem o maior atraso médio "
        f"({highest_delay_supplier['avg_delay_days']:.1f} dias)."
    )

    worst_region_on_time = region_performance.sort_values("on_time_rate").iloc[0]
    insights.append(
        f"A região {worst_region_on_time['region']} possui a menor taxa de entregas no prazo "
        f"({worst_region_on_time['on_time_rate'] * 100:.1f}%)."
    )

    top_product = top_products_stockout.iloc[0]
    insights.append(
        f"O produto {top_product['product']} lidera em rupturas recorrentes "
        f"({int(top_product['stockout_count'])} ocorrências)."
    )

    worst_forecast_category = forecast_accuracy_by_category.iloc[0]
    insights.append(
        f"A categoria {worst_forecast_category['category']} tem a menor precisão média de previsão "
        f"({worst_forecast_category['forecast_accuracy'] * 100:.1f}%)."
    )

    if len(monthly_performance) > 1:
        first_row = monthly_performance.iloc[0]
        last_row = monthly_performance.iloc[-1]
        trend = "subiu" if last_row["avg_lead_time_days"] > first_row["avg_lead_time_days"] else "caiu"
        insights.append(
            f"O lead time médio {trend} de {first_row['avg_lead_time_days']:.1f} para "
            f"{last_row['avg_lead_time_days']:.1f} dias entre {first_row['order_month']} e {last_row['order_month']}."
        )

    table_df = df.sort_values("order_date", ascending=False).head(120).copy()
    table_df["order_date"] = table_df["order_date"].dt.strftime("%Y-%m-%d")

    table_columns = [
        "order_id",
        "order_date",
        "region",
        "supplier",
        "category",
        "product",
        "quantity_ordered",
        "quantity_delivered",
        "demand_forecast",
        "demand_actual",
        "lead_time_actual_days",
        "lead_time_delay_days",
        "stockout",
        "waste_percent",
        "on_time_delivery",
        "total_cost_eur",
    ]
    table_rows = table_df[table_columns].to_dict(orient="records")

    charts = {
        "monthly_performance": {
            "labels": monthly_performance["order_month"].tolist(),
            "avg_lead_time_days": [
                _safe_float(v) for v in monthly_performance["avg_lead_time_days"].tolist()
            ],
            "stockout_rate": [
                _safe_float(v * 100) for v in monthly_performance["stockout_rate"].tolist()
            ],
            "on_time_rate": [
                _safe_float(v * 100) for v in monthly_performance["on_time_rate"].tolist()
            ],
        },
        "stockout_by_category": {
            "labels": stockout_by_category["category"].tolist(),
            "values": [_safe_float(v * 100) for v in stockout_by_category["stockout_rate"].tolist()],
        },
        "top_products_stockout": {
            "labels": top_products_stockout["product"].tolist(),
            "values": [_safe_float(v * 100) for v in top_products_stockout["stockout_rate"].tolist()],
            "counts": [int(v) for v in top_products_stockout["stockout_count"].tolist()],
        },
        "on_time_delivery_split": {
            "labels": ["No Prazo", "Atrasadas"],
            "values": [int(df["on_time_flag"].sum()), int(total_orders - df["on_time_flag"].sum())],
        },
        "supplier_delay": {
            "labels": supplier_delay["supplier"].tolist(),
            "values": [_safe_float(v) for v in supplier_delay["avg_delay_days"].tolist()],
        },
        "forecast_vs_actual": {
            "labels": forecast_vs_actual["order_month"].tolist(),
            "forecast": [_safe_float(v) for v in forecast_vs_actual["forecast"].tolist()],
            "actual": [_safe_float(v) for v in forecast_vs_actual["actual"].tolist()],
        },
        "waste_by_category": {
            "labels": waste_by_category["category"].tolist(),
            "values": [_safe_float(v) for v in waste_by_category["avg_waste_percent"].tolist()],
        },
        "cost_by_supplier": {
            "labels": cost_by_supplier["supplier"].tolist(),
            "values": [_safe_float(v) for v in cost_by_supplier["total_cost"].tolist()],
        },
        "region_performance": [
            {
                "region": row["region"],
                "avg_lead_time_days": _safe_float(row["avg_lead_time_days"]),
                "avg_delay_days": _safe_float(row["avg_delay_days"]),
                "on_time_rate": _safe_float(row["on_time_rate"] * 100),
                "stockout_rate": _safe_float(row["stockout_rate"] * 100),
                "avg_waste_percent": _safe_float(row["avg_waste_percent"]),
            }
            for _, row in region_performance.iterrows()
        ],
        "top_regions_delay": {
            "labels": top_regions_delay["region"].tolist(),
            "values": [_safe_float(v) for v in top_regions_delay["avg_delay_days"].tolist()],
        },
    }

    return {
        "record_count": int(total_orders),
        "period_start": period_start,
        "period_end": period_end,
        "kpis": kpis,
        "charts": charts,
        "insights": insights,
        "table_rows": table_rows,
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
