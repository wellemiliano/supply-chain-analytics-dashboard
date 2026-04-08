const chartRegistry = {};
let allRecords = [];
let filterOptions = null;

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

const filterIds = [
  "start_date",
  "end_date",
  "region",
  "warehouse",
  "supplier",
  "category",
  "product",
];

const numericColumns = [
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
];

document.addEventListener("DOMContentLoaded", () => {
  const filtersForm = document.getElementById("filters-form");
  const resetBtn = document.getElementById("reset-filters");

  filtersForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadDashboard();
  });

  resetBtn.addEventListener("click", () => {
    if (!filterOptions) {
      return;
    }
    initializeFilters(filterOptions);
    loadDashboard();
  });

  bootstrapStaticDashboard();
});

async function bootstrapStaticDashboard() {
  setStatus("A carregar dados locais...", true);
  const dataUrl = window.DASHBOARD_DATA_URL || "./data/records.json";
  setText("data-source", dataUrl);

  try {
    const response = await fetch(dataUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Falha ao carregar dataset (${response.status})`);
    }

    const rows = await response.json();
    allRecords = rows.map(prepareRecord).filter((record) => record.order_date_obj);
    filterOptions = buildFilterOptions(allRecords);
    initializeFilters(filterOptions);
    loadDashboard();
  } catch (error) {
    setStatus(error.message, false);
  }
}

function prepareRecord(row) {
  const record = { ...row };
  for (const column of numericColumns) {
    record[column] = toNumber(record[column]);
  }

  record.order_date_obj = parseDate(record.order_date);
  record.expected_delivery_date_obj = parseDate(record.expected_delivery_date);
  record.actual_delivery_date_obj = parseDate(record.actual_delivery_date);
  record.order_month = record.order_date ? record.order_date.slice(0, 7) : "";

  record.stockout_flag = yesNoToBool(record.stockout);
  record.on_time_flag = yesNoToBool(record.on_time_delivery);
  record.lead_time_delay_days = Math.max(
    record.lead_time_actual_days - record.lead_time_expected_days,
    0
  );

  const expectedTime = record.expected_delivery_date_obj
    ? record.expected_delivery_date_obj.getTime()
    : 0;
  const actualTime = record.actual_delivery_date_obj
    ? record.actual_delivery_date_obj.getTime()
    : expectedTime;
  const deliveryDelayDays = Math.floor((actualTime - expectedTime) / 86400000);
  record.delivery_delay_days = Math.max(deliveryDelayDays, 0);

  record.forecast_abs_error = Math.abs(
    record.demand_actual - record.demand_forecast
  );
  record.forecast_accuracy =
    record.demand_forecast > 0
      ? clamp(1 - record.forecast_abs_error / record.demand_forecast, 0, 1)
      : 0;
  record.stock_coverage_ratio =
    record.demand_actual > 0 ? record.final_stock / record.demand_actual : 0;
  record.stock_gap_units = Math.max(
    record.quantity_ordered - record.quantity_delivered,
    0
  );
  if (record.total_cost_eur <= 0) {
    record.total_cost_eur = record.quantity_delivered * record.unit_cost_eur;
  }
  record.waste_cost_eur = record.total_cost_eur * (record.waste_percent / 100);

  return record;
}

function buildFilterOptions(records) {
  const dateValues = records
    .map((record) => record.order_date)
    .filter(Boolean)
    .sort();

  return {
    min_date: dateValues[0] || "",
    max_date: dateValues[dateValues.length - 1] || "",
    regions: uniqueSorted(records.map((record) => record.region)),
    warehouses: uniqueSorted(records.map((record) => record.warehouse)),
    suppliers: uniqueSorted(records.map((record) => record.supplier)),
    categories: uniqueSorted(records.map((record) => record.category)),
    products: uniqueSorted(records.map((record) => record.product)),
  };
}

function initializeFilters(options) {
  setDateField("start_date", options.min_date, options.max_date, options.min_date);
  setDateField("end_date", options.min_date, options.max_date, options.max_date);
  populateSelect("region", options.regions);
  populateSelect("warehouse", options.warehouses);
  populateSelect("supplier", options.suppliers);
  populateSelect("category", options.categories);
  populateSelect("product", options.products);
}

function setDateField(id, minDate, maxDate, defaultValue) {
  const input = document.getElementById(id);
  input.min = minDate || "";
  input.max = maxDate || "";
  input.value = defaultValue || "";
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

function readFilters() {
  const filters = {};
  filterIds.forEach((id) => {
    filters[id] = document.getElementById(id).value;
  });
  return filters;
}

function applyFilters(records, filters) {
  const startDate = parseDate(filters.start_date);
  const endDate = parseDate(filters.end_date);

  return records.filter((record) => {
    if (startDate && record.order_date_obj < startDate) {
      return false;
    }
    if (endDate && record.order_date_obj > endDate) {
      return false;
    }

    for (const field of ["region", "warehouse", "supplier", "category", "product"]) {
      const selected = filters[field];
      if (selected && selected !== "all" && record[field] !== selected) {
        return false;
      }
    }
    return true;
  });
}

function loadDashboard() {
  if (!allRecords.length) {
    return;
  }

  setStatus("A processar KPIs e graficos...", true);
  const filters = readFilters();
  const filtered = applyFilters(allRecords, filters);
  const payload = computeDashboardPayload(filtered);

  renderKpis(payload.kpis);
  renderCharts(payload.charts);
  renderInsights(payload.insights);
  renderRegionPerformance(payload.charts.region_performance || []);
  renderOrdersTable(payload.table_rows || []);

  setText("updated-at", payload.updated_at);
  setStatus(`Mostrando ${integerFormatter.format(payload.record_count)} registos.`, false);
}

function computeDashboardPayload(records) {
  if (!records.length) {
    return emptyPayload();
  }

  const totalOrders = records.length;
  const stockoutCount = records.filter((record) => record.stockout_flag).length;
  const onTimeCount = records.filter((record) => record.on_time_flag).length;

  const kpis = {
    total_inventory: round(sum(records.map((record) => record.final_stock))),
    avg_lead_time_days: round(mean(records.map((record) => record.lead_time_actual_days))),
    stockout_rate: round((stockoutCount / totalOrders) * 100),
    on_time_rate: round((onTimeCount / totalOrders) * 100),
    avg_waste_percent: round(mean(records.map((record) => record.waste_percent))),
    forecast_accuracy_rate: round(
      mean(records.map((record) => record.forecast_accuracy)) * 100
    ),
    avg_stock_coverage: round(
      mean(records.map((record) => record.stock_coverage_ratio)),
      3
    ),
    total_cost_eur: round(sum(records.map((record) => record.total_cost_eur))),
  };

  const monthlyPerformance = groupToRows(records, "order_month", (items) => ({
    avg_lead_time_days: mean(items.map((item) => item.lead_time_actual_days)),
    stockout_rate: mean(items.map((item) => (item.stockout_flag ? 1 : 0))),
    on_time_rate: mean(items.map((item) => (item.on_time_flag ? 1 : 0))),
  })).sort((a, b) => a.key.localeCompare(b.key));

  const stockoutByCategory = groupToRows(records, "category", (items) => ({
    stockout_rate: mean(items.map((item) => (item.stockout_flag ? 1 : 0))),
    orders: items.length,
  })).sort(
    (a, b) => b.stockout_rate - a.stockout_rate || b.orders - a.orders
  );

  const topProductsStockout = groupToRows(records, "product", (items) => ({
    stockout_rate: mean(items.map((item) => (item.stockout_flag ? 1 : 0))),
    stockout_count: items.filter((item) => item.stockout_flag).length,
    orders: items.length,
  }))
    .sort(
      (a, b) =>
        b.stockout_rate - a.stockout_rate || b.stockout_count - a.stockout_count
    )
    .slice(0, 10);

  const supplierDelay = groupToRows(records, "supplier", (items) => ({
    avg_delay_days: mean(items.map((item) => item.lead_time_delay_days)),
  })).sort((a, b) => b.avg_delay_days - a.avg_delay_days);

  const forecastVsActual = groupToRows(records, "order_month", (items) => ({
    forecast: sum(items.map((item) => item.demand_forecast)),
    actual: sum(items.map((item) => item.demand_actual)),
  })).sort((a, b) => a.key.localeCompare(b.key));

  const wasteByCategory = groupToRows(records, "category", (items) => ({
    avg_waste_percent: mean(items.map((item) => item.waste_percent)),
  })).sort((a, b) => b.avg_waste_percent - a.avg_waste_percent);

  const costBySupplier = groupToRows(records, "supplier", (items) => ({
    total_cost: sum(items.map((item) => item.total_cost_eur)),
  })).sort((a, b) => b.total_cost - a.total_cost);

  const regionPerformance = groupToRows(records, "region", (items) => ({
    avg_lead_time_days: mean(items.map((item) => item.lead_time_actual_days)),
    avg_delay_days: mean(items.map((item) => item.lead_time_delay_days)),
    on_time_rate: mean(items.map((item) => (item.on_time_flag ? 1 : 0))),
    stockout_rate: mean(items.map((item) => (item.stockout_flag ? 1 : 0))),
    avg_waste_percent: mean(items.map((item) => item.waste_percent)),
  })).sort((a, b) => b.avg_delay_days - a.avg_delay_days);

  const topRegionsDelay = [...regionPerformance]
    .sort((a, b) => b.avg_delay_days - a.avg_delay_days)
    .slice(0, 5);

  const forecastAccuracyByCategory = groupToRows(records, "category", (items) => ({
    forecast_accuracy: mean(items.map((item) => item.forecast_accuracy)),
  })).sort((a, b) => a.forecast_accuracy - b.forecast_accuracy);

  const insights = [];
  if (stockoutByCategory.length) {
    insights.push(
      `A categoria ${stockoutByCategory[0].key} apresenta a maior taxa de ruptura (${round(
        stockoutByCategory[0].stockout_rate * 100
      )}%).`
    );
  }
  if (supplierDelay.length) {
    insights.push(
      `O fornecedor ${supplierDelay[0].key} tem o maior atraso medio (${round(
        supplierDelay[0].avg_delay_days
      )} dias).`
    );
  }
  if (regionPerformance.length) {
    const worstRegion = [...regionPerformance].sort(
      (a, b) => a.on_time_rate - b.on_time_rate
    )[0];
    insights.push(
      `A regiao ${worstRegion.key} possui a menor taxa de entregas no prazo (${round(
        worstRegion.on_time_rate * 100
      )}%).`
    );
  }
  if (topProductsStockout.length) {
    insights.push(
      `O produto ${topProductsStockout[0].key} lidera em rupturas recorrentes (${topProductsStockout[0].stockout_count} ocorrencias).`
    );
  }
  if (forecastAccuracyByCategory.length) {
    insights.push(
      `A categoria ${forecastAccuracyByCategory[0].key} tem a menor precisao media de previsao (${round(
        forecastAccuracyByCategory[0].forecast_accuracy * 100
      )}%).`
    );
  }
  if (monthlyPerformance.length > 1) {
    const firstRow = monthlyPerformance[0];
    const lastRow = monthlyPerformance[monthlyPerformance.length - 1];
    const trend =
      lastRow.avg_lead_time_days > firstRow.avg_lead_time_days ? "subiu" : "caiu";
    insights.push(
      `O lead time medio ${trend} de ${round(firstRow.avg_lead_time_days)} para ${round(
        lastRow.avg_lead_time_days
      )} dias entre ${firstRow.key} e ${lastRow.key}.`
    );
  }

  const tableRows = [...records]
    .sort((a, b) => b.order_date_obj - a.order_date_obj)
    .slice(0, 120)
    .map((record) => ({
      order_id: record.order_id,
      order_date: record.order_date,
      region: record.region,
      supplier: record.supplier,
      category: record.category,
      product: record.product,
      quantity_ordered: record.quantity_ordered,
      quantity_delivered: record.quantity_delivered,
      demand_forecast: record.demand_forecast,
      demand_actual: record.demand_actual,
      lead_time_actual_days: record.lead_time_actual_days,
      lead_time_delay_days: record.lead_time_delay_days,
      stockout: record.stockout,
      waste_percent: record.waste_percent,
      on_time_delivery: record.on_time_delivery,
      total_cost_eur: record.total_cost_eur,
    }));

  const charts = {
    monthly_performance: {
      labels: monthlyPerformance.map((row) => row.key),
      avg_lead_time_days: monthlyPerformance.map((row) => round(row.avg_lead_time_days)),
      stockout_rate: monthlyPerformance.map((row) => round(row.stockout_rate * 100)),
      on_time_rate: monthlyPerformance.map((row) => round(row.on_time_rate * 100)),
    },
    stockout_by_category: {
      labels: stockoutByCategory.map((row) => row.key),
      values: stockoutByCategory.map((row) => round(row.stockout_rate * 100)),
    },
    top_products_stockout: {
      labels: topProductsStockout.map((row) => row.key),
      values: topProductsStockout.map((row) => round(row.stockout_rate * 100)),
      counts: topProductsStockout.map((row) => row.stockout_count),
    },
    on_time_delivery_split: {
      labels: ["No Prazo", "Atrasadas"],
      values: [onTimeCount, totalOrders - onTimeCount],
    },
    supplier_delay: {
      labels: supplierDelay.map((row) => row.key),
      values: supplierDelay.map((row) => round(row.avg_delay_days)),
    },
    forecast_vs_actual: {
      labels: forecastVsActual.map((row) => row.key),
      forecast: forecastVsActual.map((row) => round(row.forecast)),
      actual: forecastVsActual.map((row) => round(row.actual)),
    },
    waste_by_category: {
      labels: wasteByCategory.map((row) => row.key),
      values: wasteByCategory.map((row) => round(row.avg_waste_percent)),
    },
    cost_by_supplier: {
      labels: costBySupplier.map((row) => row.key),
      values: costBySupplier.map((row) => round(row.total_cost)),
    },
    region_performance: regionPerformance.map((row) => ({
      region: row.key,
      avg_lead_time_days: round(row.avg_lead_time_days),
      avg_delay_days: round(row.avg_delay_days),
      on_time_rate: round(row.on_time_rate * 100),
      stockout_rate: round(row.stockout_rate * 100),
      avg_waste_percent: round(row.avg_waste_percent),
    })),
    top_regions_delay: {
      labels: topRegionsDelay.map((row) => row.key),
      values: topRegionsDelay.map((row) => round(row.avg_delay_days)),
    },
  };

  return {
    record_count: totalOrders,
    kpis,
    charts,
    insights,
    table_rows: tableRows,
    updated_at: formatDateTime(new Date()),
  };
}

function emptyPayload() {
  return {
    record_count: 0,
    kpis: {
      total_inventory: 0,
      avg_lead_time_days: 0,
      stockout_rate: 0,
      on_time_rate: 0,
      avg_waste_percent: 0,
      forecast_accuracy_rate: 0,
      avg_stock_coverage: 0,
      total_cost_eur: 0,
    },
    charts: {
      monthly_performance: {
        labels: [],
        avg_lead_time_days: [],
        stockout_rate: [],
        on_time_rate: [],
      },
      stockout_by_category: { labels: [], values: [] },
      top_products_stockout: { labels: [], values: [], counts: [] },
      on_time_delivery_split: { labels: ["No Prazo", "Atrasadas"], values: [0, 0] },
      supplier_delay: { labels: [], values: [] },
      forecast_vs_actual: { labels: [], forecast: [], actual: [] },
      waste_by_category: { labels: [], values: [] },
      cost_by_supplier: { labels: [], values: [] },
      region_performance: [],
      top_regions_delay: { labels: [], values: [] },
    },
    insights: ["Nenhum registo encontrado para os filtros aplicados."],
    table_rows: [],
    updated_at: formatDateTime(new Date()),
  };
}

function renderKpis(kpis) {
  setText("kpi-total_inventory", integerFormatter.format(kpis.total_inventory || 0));
  setText(
    "kpi-avg_lead_time_days",
    `${decimalFormatter.format(kpis.avg_lead_time_days || 0)} dias`
  );
  setText("kpi-stockout_rate", `${decimalFormatter.format(kpis.stockout_rate || 0)}%`);
  setText("kpi-on_time_rate", `${decimalFormatter.format(kpis.on_time_rate || 0)}%`);
  setText(
    "kpi-avg_waste_percent",
    `${decimalFormatter.format(kpis.avg_waste_percent || 0)}%`
  );
  setText(
    "kpi-forecast_accuracy_rate",
    `${decimalFormatter.format(kpis.forecast_accuracy_rate || 0)}%`
  );
  setText(
    "kpi-avg_stock_coverage",
    `${decimalFormatter.format(kpis.avg_stock_coverage || 0)}x`
  );
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
          label: "Lead Time Medio (dias)",
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
          label: "Atraso Medio (dias)",
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
          label: "Previsao",
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
          label: "Desperdicio Medio (%)",
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
      <td data-label="Regiao">${escapeHtml(row.region)}</td>
      <td data-label="Lead Time Medio">${decimalFormatter.format(row.avg_lead_time_days)} dias</td>
      <td data-label="Atraso Medio">${decimalFormatter.format(row.avg_delay_days)} dias</td>
      <td data-label="Entregas no Prazo" style="background:${heatColor(row.on_time_rate, true)}">${decimalFormatter.format(row.on_time_rate)}%</td>
      <td data-label="Taxa de Ruptura" style="background:${heatColor(row.stockout_rate, false)}">${decimalFormatter.format(row.stockout_rate)}%</td>
      <td data-label="Desperdicio Medio">${decimalFormatter.format(row.avg_waste_percent)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderOrdersTable(rows) {
  const tbody = document.querySelector("#orders-table tbody");
  tbody.innerHTML = "";

  rows.forEach((row) => {
    const stockoutClass = yesNoToBool(row.stockout) ? "badge-no" : "badge-ok";
    const onTimeClass = yesNoToBool(row.on_time_delivery) ? "badge-ok" : "badge-no";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Pedido">${escapeHtml(row.order_id)}</td>
      <td data-label="Data">${escapeHtml(row.order_date)}</td>
      <td data-label="Regiao">${escapeHtml(row.region)}</td>
      <td data-label="Fornecedor">${escapeHtml(row.supplier)}</td>
      <td data-label="Categoria">${escapeHtml(row.category)}</td>
      <td data-label="Produto">${escapeHtml(row.product)}</td>
      <td data-label="Qtd. Pedida">${integerFormatter.format(row.quantity_ordered || 0)}</td>
      <td data-label="Qtd. Entregue">${integerFormatter.format(row.quantity_delivered || 0)}</td>
      <td data-label="Prev. Procura">${integerFormatter.format(row.demand_forecast || 0)}</td>
      <td data-label="Procura Real">${integerFormatter.format(row.demand_actual || 0)}</td>
      <td data-label="Lead Time">${decimalFormatter.format(row.lead_time_actual_days || 0)} dias</td>
      <td data-label="Atraso">${decimalFormatter.format(row.lead_time_delay_days || 0)} dias</td>
      <td data-label="Ruptura"><span class="table-cell-badge ${stockoutClass}">${escapeHtml(row.stockout)}</span></td>
      <td data-label="Desperdicio">${decimalFormatter.format(row.waste_percent || 0)}%</td>
      <td data-label="No Prazo"><span class="table-cell-badge ${onTimeClass}">${escapeHtml(row.on_time_delivery)}</span></td>
      <td data-label="Custo Total">${currencyFormatter.format(row.total_cost_eur || 0)}</td>
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

function setStatus(message, loading) {
  const status = document.getElementById("status-line");
  status.textContent = message;
  status.style.color = loading ? "#2563eb" : "#4f6d89";
}

function setText(id, value) {
  const element = document.getElementById(id);
  element.textContent = value;
}

function heatColor(value, highIsGood) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  const score = highIsGood ? safe : 100 - safe;
  const hue = Math.round((score * 120) / 100);
  return `hsl(${hue}, 66%, 86%)`;
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt")
  );
}

function yesNoToBool(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return normalized === "sim" || normalized === "yes" || normalized === "true";
}

function groupToRows(records, keyField, aggregateFn) {
  const groups = new Map();
  records.forEach((record) => {
    const key = record[keyField] || "";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(record);
  });

  const rows = [];
  for (const [key, items] of groups.entries()) {
    rows.push({ key, ...aggregateFn(items) });
  }
  return rows;
}

function formatDateTime(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function mean(values) {
  if (!values.length) {
    return 0;
  }
  return sum(values) / values.length;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
