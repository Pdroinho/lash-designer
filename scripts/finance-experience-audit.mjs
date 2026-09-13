import fs from 'node:fs'

const app = fs.readFileSync('src/App.tsx', 'utf8')
const server = fs.readFileSync('server/index.ts', 'utf8')
const bridge = fs.readFileSync('server/lumaBridge.ts', 'utf8')
const finance = fs.readFileSync('server/finance.ts', 'utf8')
const main = fs.readFileSync('src/main.tsx', 'utf8')
const css = fs.readFileSync('src/finance-v36.css', 'utf8')
const prompt = fs.readFileSync('server/assistant.ts', 'utf8')
const flowChart = fs.readFileSync('src/components/FinanceFlowChart.tsx', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

const checks = [
  ['rótulo mensal não instancia Date a partir de YYYY-MM', app.includes('financeMonthLabel = (ym: string)') && !app.includes('new Date(`${m.ym}-01T00:00:00.000Z`)')],
  ['cards usam currentMonth em vez de totals histórico', app.includes('const current = finance.currentMonth') && !app.includes('revenue: finance?.totals.entriesCents')],
  ['transação manual envia data civil ao backend', app.includes('body: JSON.stringify({') && app.includes('date\n        })') && server.includes("date: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional()")],
  ['backend converte data civil usando timezone do tenant', server.includes('utcForLocalTime({ timeZone, ...parsed, hour: 12, minute: 0 })')],
  ['extrato envia startDate/endDate sem fuso do navegador', app.includes('/api/admin/finance/extract?startDate=') && !app.includes('new Date(`${start}T00:00:00`).toISOString()')],
  ['extrato converte limites com dayBoundsUtc no servidor', server.includes('const startBounds = dayBoundsUtc({ timeZone, ymd: startDate })') && server.includes('const endBounds = dayBoundsUtc({ timeZone, ymd: endDate })')],
  ['janela mensal da Luma usa monthBoundsUtc', server.includes('monthBoundsUtc({ timeZone: timezone, year: nowParts.year, month: nowParts.month }).start.toISOString()')],
  ['Luma possui ferramenta financeira dedicada', bridge.includes("name: 'get_finance_overview'")],
  ['visão financeira da Luma inclui metas atuais', bridge.includes('revenueProgressPercent') && bridge.includes('newClientsProgressPercent')],
  ['Luma e Financeiro compartilham cálculo mensal', bridge.includes('financeMonthSnapshot(') && server.includes('financeMonthSnapshot(') && finance.includes('export function financeMonthSnapshot')],
  ['prompt proíbe chamar saldo de lucro contábil', prompt.includes('Não chame esse saldo de lucro líquido ou lucro contábil.')],
  ['Financeiro não exibe lucro líquido enganoso', !app.includes('Lucro Líquido') && !app.includes('Saldo disponível para saque imediato')],
  ['visual Finance mantém contrato de produto', main.includes("import './finance-v36.css'") && css.includes('.finance36-hero')],
  ['integração contextual com Luma abre drawer com prompt', app.includes("new CustomEvent('lashdesigner:luma-open'")],
  ['gráfico financeiro usa componente dedicado', app.includes('<FinanceFlowChart') && app.includes("import { FinanceFlowChart } from './components/FinanceFlowChart'")],
  ['gráfico usa Chart.js em vez de SVG manual', flowChart.includes("from 'chart.js/auto'") && pkg.dependencies?.['chart.js'] === '4.5.1' && !app.includes('finance36-balance-line') && !app.includes('<svg className="finance36-balance-line"')],
  ['gráfico combina entradas, saídas e saldo', flowChart.includes("label: 'Entradas'") && flowChart.includes("label: 'Saídas'") && flowChart.includes("label: 'Saldo'")],
  ['meses sem movimento não fabricam linha de saldo zero', flowChart.includes('movementMask[index] ? point.balanceCents / 100 : null') && flowChart.includes('spanGaps: false')],
  ['histórico curto é explicado fora do plot', flowChart.includes('A leitura fica mais comparável conforme o histórico cresce.') && css.includes('.finance40-chart-caption')],
  ['movimentação manual usa dropdown canônico', app.includes('finance40-transaction-dialog') && app.includes('<ProductSelect') && !app.includes('isSelectOpen')],
  ['extrato usa dropdown canônico e tabela sticky por CSS', app.includes('Filtrar extrato por tipo') && css.includes('.finance40-extract-table thead') && !app.includes("<thead style={{position: 'sticky'")],
  ['CSV protege células de fórmula', app.includes("/^[=+\\-@]/.test(text)")],
  ['movimentação vazia não envia method inválido', app.includes('method: method.trim() || undefined')],
  ['extrato rejeita intervalo invertido', server.includes("'INVALID_DATE_RANGE'")],
]

let passed = 0
for (const [label, ok] of checks) {
  if (ok) {
    passed += 1
    console.log(`✓ ${label}`)
  } else {
    console.error(`✗ ${label}`)
  }
}

console.log(`\n${passed}/${checks.length} verificações do Financeiro aprovadas.`)
if (passed !== checks.length) process.exit(1)
