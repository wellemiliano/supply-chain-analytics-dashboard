# Supply Chain Analytics Dashboard

Interactive dashboard for supply chain KPIs (inventory, stockout, lead time, waste, demand forecast, and logistics performance).

This repository now includes a static-first version ready for GitHub Pages, plus the original Flask backend files.

## Live Links

- Static dashboard (GitHub Pages target): `https://wellemiliano.github.io/supply-chain-analytics-dashboard/`
- Python backend version (Render): `https://supply-chain-analytics-dashboard-mifq.onrender.com`

## What This Dashboard Answers

- Which products have the highest stockout risk?
- Which regions have the worst lead time?
- Which suppliers are delivering late most often?
- Where is waste highest?
- How close is forecast demand vs actual demand?
- What is the on-time delivery rate?
- How are KPIs evolving month by month?

## Tech Stack

Static version (recommended for portfolio uptime):
- HTML + CSS + JavaScript
- Chart.js
- Data source: `data/records.json` (generated from XML)

Backend version (kept in repo):
- Flask + pandas

## Project Structure

```text
supply-chain-analytics-dashboard/
|-- index.html
|-- data/
|   `-- records.json
|-- static/
|   |-- css/
|   |   `-- style.css
|   `-- js/
|       |-- dashboard.js
|       `-- dashboard-static.js
|-- scripts/
|   `-- export_records_json.py
|-- dados/
|   `-- dados_ficticios_supply_chain.xml
|-- app.py
|-- requirements.txt
`-- README.md
```

## Regenerate Static Data

If you update the XML source, regenerate `data/records.json`:

```bash
python scripts/export_records_json.py
```

## Run Locally (Static)

From repository root:

```bash
python -m http.server 8000
```

Open:

`http://127.0.0.1:8000`

## Publish on GitHub Pages (Free)

1. Push code to `main`.
2. In GitHub repo: `Settings` -> `Pages`.
3. Source: `Deploy from a branch`.
4. Branch: `main` and folder: `/ (root)`.
5. Save.

GitHub provides the final public URL in a few minutes.

## KPI Set

- Total Inventory
- Average Lead Time
- Stockout Rate
- On-time Delivery Rate
- Average Waste
- Forecast Accuracy
- Stock Coverage
- Total Cost

## Notes

- Static hosting removes free-tier backend sleep risk.
- For very large datasets, browser-side processing may become slower.
- Flask files are still available if you want to run the backend mode later.
