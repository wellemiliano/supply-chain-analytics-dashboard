const chartRegistry = {};

const currencyFormatter = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const integerFormatter = new Intl.NumberFormat("pt-PT", {
  maximumFractionDigits: 0,
});
const decimalFormatter = new Intl.NumberFormat("pt-PT", {
  maximumFractionDigits: 2,
});

document.addEventListener("DOMContentLoaded", () => {
  initializeFilters(window.FILTER_OPTIONS || {});

  const filtersForm = document.getElementById("filters-form");
  const resetBtn = document.getElementById("reset-filters");

  filtersForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadDashboard();
  });

  resetBtn.addEventListener("click", () => {
    initializeFilters(window.FILTER_OPTIONS || {});
    loadDashboard();
  });

  loadDashboard();
});

function initializeFilters(filterOptions) {
  setDateField("start_date", filterOptions.min_date, filterOptions.max_date, filterOptions.min_date);
  setDateField("end_date", filterOptions.min_date, filterOptions.max_date, filterOptions.max_date);
  populateSelect("region", filterOptions.regions || []);
  populateSelect("warehouse", filterOptions.warehouses || []);
  populateSelect("supplier", filterOptions.suppliers || []);
  populateSelect("category", filterOptions.categories || []);
  populateSelect("product", filterOptions.products || []);
}

function setDateField(id, min, max, value) {
  const input = document.getElementById(id);
  input.min = min || "";
  input.max = max || "";
  input.value = value || "";
}

function populateSelect(id, values) {
  const select = document.getElementById(id);
  select.innerHTML = "";

  const optionAll = document.createElement("option");
  optionAll.value = "all";
  optionAll.textContent = "Todos";
  select.appendChild(optionAll);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function buildQueryString() {
  const params = new URLSearchParams();
  const filterIds = ["start_date", "end_date", "region", "warehouse", "supplier", "category", "product"];

  filterIds.forEach((id) => {
    const value = document.getElementById(id).value;
    if (value && value !== "all") {
      params.append(id, value);
    }
  });

  return params.toString();
}

async function loadDashboard() {
  setStatus("A atualizar dados...", true);
  const queryString = buildQueryString();
  const endpoint = queryString ? `/api/dashboard?${queryString}` : "/api/dashboard";

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Falha ao carregar os dados (${response.status})`);
    }

    const payload = await response.json();
    renderKpis(payload.kpis);
    renderCharts(payload.charts);
    renderInsights(payload.insights);
    renderRegionPerformance(payload.charts.region_performance || []);
    renderOrdersTable(payload.table_rows || []);

    setText("updated-at", payload.updated_at || "-");
    setStatus(`Mostrando ${integerFormatter.format(payload.record_count || 0)} registos.`, false);
  } catch (error) {
    setStatus(error.message, false);
  }
}

function renderKpis(kpis) {
  setText("kpi-total_inventory", integerFormatter.format(kpis.total_inventory || 0));
  setText("kpi-avg_lead_time_days", `${decimalFormatter.format(kpis.avg_lead_time_days || 0)} dias`);
  setText("kpi-stockout_rate", `${decimalFormatter.format(kpis.stockout_rate || 0)}%`);
  setText("kpi-on_time_rate", `${decimalFormatter.format(kpis.on_time_rate || 0)}%`);
  setText("kpi-avg_waste_percent", `${decimalFormatter.format(kpis.avg_waste_percent || 0)}%`);
  setText("kpi-forecast_accuracy_rate", `${decimalFormatter.format(kpis.forecast_accuracy_rate || 0)}%`);
  setText("kpi-avg_stock_coverage", `${decimalFormatter.format(kpis.avg_stock_coverage || 0)}x`);
  setText("kpi-total_cost_eur", currencyFormatter.format(kpis.total_cost_eur || 0));
}

function renderCharts(charts) {
  const palette = {
    orange: "#f97316",
    teal: "#0f766e",
    blue: "#2563eb",
    red: "#dc2626",
    slate: "#102a43",
    sky: "#0ea5e9",
    amber: "#f59e0b",
  };

  upsertChart("chart-monthly-lead-time", {
    type: "line",
    data: {
      labels: charts.monthly_performance.labels,
      datasets: [
        {
          label: "Lead Time Médio (dias)",
          data: charts.monthly_performance.avg_lead_time_days,
          yAxisID: "y",
          borderColor: palette.orange,
          backgroundColor: "rgba(249, 115, 22, 0.15)",
          fill: true,
          tension: 0.25,
        },
        {
          label: "Entregas no Prazo (%)",
          data: charts.monthly_performance.on_time_rate,
          yAxisID: "y1",
          borderColor: palette.teal,
          backgroundColor: "rgba(15, 118, 110, 0.12)",
          fill: false,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Dias" },
        },
        y1: {
          beginAtZero: true,
          max: 100,
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "%" },
        },
      },
    },
  });

  upsertChart("chart-stockout-category", {
    type: "bar",
    data: {
      labels: charts.stockout_by_category.labels,
      datasets: [
        {
          label: "Taxa de Ruptura (%)",
          data: charts.stockout_by_category.values,
          backgroundColor: "rgba(220, 38, 38, 0.65)",
          borderColor: palette.red,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, max: 100 } },
    },
  });

  upsertChart("chart-top-products-stockout", {
    type: "bar",
    data: {
      labels: charts.top_products_stockout.labels,
      datasets: [
        {
          label: "Taxa de Ruptura (%)",
          data: charts.top_products_stockout.values,
          backgroundColor: "rgba(245, 158, 11, 0.75)",
          borderColor: palette.amber,
          borderWidth: 1,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { beginAtZero: true, max: 100 } },
    },
  });

  upsertChart("chart-on-time-split", {
    type: "doughnut",
    data: {
      labels: charts.on_time_delivery_split.labels,
      datasets: [
        {
          data: charts.on_time_delivery_split.values,
          backgroundColor: ["rgba(15, 118, 110, 0.8)", "rgba(220, 38, 38, 0.75)"],
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });

  upsertChart("chart-supplier-delay", {
    type: "bar",
    data: {
      labels: charts.supplier_delay.labels,
      datasets: [
        {
          label: "Atraso Médio (dias)",
          data: charts.supplier_delay.values,
          backgroundColor: "rgba(2, 132, 199, 0.7)",
          borderColor: palette.sky,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
    },
  });

  upsertChart("chart-forecast-vs-actual", {
    type: "bar",
    data: {
      labels: charts.forecast_vs_actual.labels,
      datasets: [
        {
          label: "Previsão",
          data: charts.forecast_vs_actual.forecast,
          backgroundColor: "rgba(37, 99, 235, 0.7)",
          borderColor: palette.blue,
          borderWidth: 1,
        },
        {
          label: "Procura Real",
          data: charts.forecast_vs_actual.actual,
          backgroundColor: "rgba(249, 115, 22, 0.7)",
          borderColor: palette.orange,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
    },
  });

  upsertChart("chart-waste-category", {
    type: "bar",
    data: {
      labels: charts.waste_by_category.labels,
      datasets: [
        {
          label: "Desperdício Médio (%)",
          data: charts.waste_by_category.values,
          backgroundColor: "rgba(15, 118, 110, 0.65)",
          borderColor: palette.teal,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
    },
  });

  upsertChart("chart-cost-supplier", {
    type: "bar",
    data: {
      labels: charts.cost_by_supplier.labels,
      datasets: [
        {
          label: "Custo Total (EUR)",
          data: charts.cost_by_supplier.values,
          backgroundColor: "rgba(16, 42, 67, 0.72)",
          borderColor: palette.slate,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
    },
  });
}

function renderInsights(insights) {
  const list = document.getElementById("insights-list");
  list.innerHTML = "";

  (insights || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
}

function renderRegionPerformance(rows) {
  const tbody = document.querySelector("#region-performance-table tbody");
  tbody.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.region)}</td>
      <td>${decimalFormatter.format(row.avg_lead_time_days)} dias</td>
      <td>${decimalFormatter.format(row.avg_delay_days)} dias</td>
      <td style="background:${heatColor(row.on_time_rate, true)}">${decimalFormatter.format(row.on_time_rate)}%</td>
      <td style="background:${heatColor(row.stockout_rate, false)}">${decimalFormatter.format(row.stockout_rate)}%</td>
      <td>${decimalFormatter.format(row.avg_waste_percent)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderOrdersTable(rows) {
  const tbody = document.querySelector("#orders-table tbody");
  tbody.innerHTML = "";

  rows.forEach((row) => {
    const stockoutClass = (row.stockout || "").toLowerCase() === "sim" ? "badge-no" : "badge-ok";
    const onTimeClass = (row.on_time_delivery || "").toLowerCase() === "sim" ? "badge-ok" : "badge-no";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.order_id)}</td>
      <td>${escapeHtml(row.order_date)}</td>
      <td>${escapeHtml(row.region)}</td>
      <td>${escapeHtml(row.supplier)}</td>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.product)}</td>
      <td>${integerFormatter.format(row.quantity_ordered || 0)}</td>
      <td>${integerFormatter.format(row.quantity_delivered || 0)}</td>
      <td>${integerFormatter.format(row.demand_forecast || 0)}</td>
      <td>${integerFormatter.format(row.demand_actual || 0)}</td>
      <td>${decimalFormatter.format(row.lead_time_actual_days || 0)} dias</td>
      <td>${decimalFormatter.format(row.lead_time_delay_days || 0)} dias</td>
      <td><span class="table-cell-badge ${stockoutClass}">${escapeHtml(row.stockout)}</span></td>
      <td>${decimalFormatter.format(row.waste_percent || 0)}%</td>
      <td><span class="table-cell-badge ${onTimeClass}">${escapeHtml(row.on_time_delivery)}</span></td>
      <td>${currencyFormatter.format(row.total_cost_eur || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function upsertChart(canvasId, config) {
  if (chartRegistry[canvasId]) {
    chartRegistry[canvasId].destroy();
  }

  const ctx = document.getElementById(canvasId).getContext("2d");
  chartRegistry[canvasId] = new Chart(ctx, config);
}

function heatColor(value, highIsGood) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  const score = highIsGood ? safe : 100 - safe;
  const hue = Math.round((score * 120) / 100);
  return `hsl(${hue}, 66%, 86%)`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setText(id, value) {
  const node = document.getElementById(id);
  node.textContent = value;
}

function setStatus(message, loading) {
  const status = document.getElementById("status-line");
  status.textContent = message;
  status.style.color = loading ? "#2563eb" : "#4f6d89";
}
