from __future__ import annotations

from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, render_template, request

from utils.process_data import (
    apply_filters,
    compute_dashboard_payload,
    get_filter_options,
    load_and_prepare_data,
)


BASE_DIR = Path(__file__).resolve().parent
DATA_CANDIDATES = [
    BASE_DIR / "dados" / "dados_ficticios_supply_chain.xml",
    BASE_DIR / "dados_ficticios_supply_chain.xml",
]


def resolve_data_path() -> Path:
    for candidate in DATA_CANDIDATES:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "Arquivo de dados não encontrado. Esperado em dados/dados_ficticios_supply_chain.xml"
    )


DATA_PATH = resolve_data_path()
DATAFRAME = load_and_prepare_data(DATA_PATH)
BOOT_TIMESTAMP = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
app = Flask(__name__)


@app.get("/")
def index():
    period_start = DATAFRAME["order_date"].min().strftime("%Y-%m-%d")
    period_end = DATAFRAME["order_date"].max().strftime("%Y-%m-%d")
    return render_template(
        "index.html",
        filter_options=get_filter_options(DATAFRAME),
        data_source=DATA_PATH.name,
        record_count=int(len(DATAFRAME)),
        period_start=period_start,
        period_end=period_end,
        metadata_updated_at=BOOT_TIMESTAMP,
    )


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "records": int(len(DATAFRAME))})


@app.get("/api/dashboard")
def dashboard_data():
    filters = {
        "start_date": request.args.get("start_date"),
        "end_date": request.args.get("end_date"),
        "region": request.args.getlist("region") or request.args.get("region"),
        "warehouse": request.args.getlist("warehouse")
        or request.args.get("warehouse"),
        "supplier": request.args.getlist("supplier") or request.args.get("supplier"),
        "category": request.args.getlist("category") or request.args.get("category"),
        "product": request.args.getlist("product") or request.args.get("product"),
    }

    filtered = apply_filters(DATAFRAME, filters)
    payload = compute_dashboard_payload(filtered)
    payload["data_source"] = DATA_PATH.name
    payload["applied_filters"] = {
        key: value
        for key, value in filters.items()
        if value not in (None, "", [], [""])
    }
    return jsonify(payload)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
