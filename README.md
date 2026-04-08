# Supply Chain Analytics Dashboard

Dashboard web interativo para monitorização de KPIs da cadeia de abastecimento (inventário, rupturas, lead time, desperdício, previsões e performance logística), construído com Python + Flask + pandas + HTML/CSS/JavaScript + Chart.js.

## Objetivo

Responder perguntas de negócio como:
- Quais produtos têm maior risco de ruptura?
- Quais regiões têm pior lead time?
- Quais fornecedores entregam com mais atraso?
- Onde está o maior desperdício?
- A previsão de procura está perto da procura real?
- Qual é a taxa de entregas no prazo?

## Stack

- Backend: Flask
- Tratamento de dados: pandas
- Frontend: HTML, CSS, JavaScript
- Gráficos: Chart.js
- Fonte de dados: XML fictício (`dados/dados_ficticios_supply_chain.xml`)

## KPIs monitorizados

- Inventário Total
- Lead Time Médio
- Taxa de Ruptura
- Entregas no Prazo
- Desperdício Médio
- Precisão da Previsão
- Cobertura de Stock
- Custo Total

## Métricas derivadas

- `stockout_rate` = pedidos com stockout / total de pedidos
- `on_time_rate` = pedidos no prazo / total de pedidos
- `forecast_accuracy` = `1 - abs(demand_actual - demand_forecast) / demand_forecast`
- `lead_time_delay_days` = `max(lead_time_actual_days - lead_time_expected_days, 0)`
- `stock_coverage_ratio` = `final_stock / demand_actual`

## Estrutura do projeto

```text
supply-chain-dashboard/
├── app.py
├── requirements.txt
├── dados/
│   └── dados_ficticios_supply_chain.xml
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── dashboard.js
├── templates/
│   └── index.html
├── utils/
│   ├── __init__.py
│   └── process_data.py
└── README.md
```

## Como executar localmente

### 1) Criar ambiente virtual

```bash
python -m venv .venv
```

### 2) Ativar ambiente virtual

PowerShell:

```bash
.venv\Scripts\Activate.ps1
```

### 3) Instalar dependências

```bash
pip install -r requirements.txt
```

### 4) Executar a aplicação

```bash
python app.py
```

Aceder em: `http://127.0.0.1:5000`

## API

- `GET /api/health`: status da app e contagem de registos.
- `GET /api/dashboard`: dados do dashboard com filtros opcionais:
  - `start_date`
  - `end_date`
  - `region`
  - `warehouse`
  - `supplier`
  - `category`
  - `product`

## Deploy no Render

1. Subir o projeto para um repositório no GitHub.
2. No Render, criar um novo **Web Service** ligado ao repositório.
3. Configurar:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app`
4. Garantir que a pasta `dados/` e o XML estão versionados no repositório.
5. Fazer deploy e validar:
   - `/api/health`
   - carregamento dos filtros
   - gráficos e tabela com dados

## Próximos incrementos

- Exportação CSV/PDF de visões filtradas.
- Autenticação básica por utilizador.
- Testes automatizados (unit + integração de API).
- Alertas automáticos (ex: stockout rate acima de limiar).
