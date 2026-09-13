import { useEffect, useMemo, useRef } from 'react'
import Chart from 'chart.js/auto'

export type FinanceFlowPoint = {
  ym: string
  label: string
  entriesCents: number
  expensesCents: number
  balanceCents: number
}

type FinanceFlowChartProps = {
  data: FinanceFlowPoint[]
  currentMonthYm: string
  formatCurrency: (value: number) => string
}

function cssVar(element: HTMLElement, name: string, fallback: string) {
  const value = getComputedStyle(element).getPropertyValue(name).trim()
  return value || fallback
}

export function FinanceFlowChart({ data, currentMonthYm, formatCurrency }: FinanceFlowChartProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  const movementMonths = useMemo(
    () => data.filter((month) => month.entriesCents > 0 || month.expensesCents > 0).length,
    [data],
  )
  const movementMask = useMemo(
    () => data.map((month) => month.entriesCents > 0 || month.expensesCents > 0),
    [data],
  )

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const isMobile = host.clientWidth <= 520
    const income = cssVar(host, '--f36-income', '#2f7d62')
    const expense = cssVar(host, '--f36-expense', '#b85b70')
    const accent = cssVar(host, '--f36-accent', '#8e2e55')
    const line = cssVar(host, '--f36-line', '#e8dde2')
    const muted = cssVar(host, '--f36-muted', '#7c6d74')
    const paper = cssVar(host, '--f36-paper', '#ffffff')
    const ink = cssVar(host, '--f36-ink', '#2d2428')

    chartRef.current?.destroy()

    chartRef.current = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.map((point) => point.label),
        datasets: [
          {
            type: 'bar',
            label: 'Entradas',
            data: data.map((point) => point.entriesCents / 100),
            backgroundColor: income,
            borderColor: income,
            borderWidth: 0,
            borderRadius: 6,
            borderSkipped: false,
            categoryPercentage: 0.62,
            barPercentage: 0.82,
            maxBarThickness: 26,
            order: 2,
          },
          {
            type: 'bar',
            label: 'Saídas',
            data: data.map((point) => point.expensesCents / 100),
            backgroundColor: expense,
            borderColor: expense,
            borderWidth: 0,
            borderRadius: 6,
            borderSkipped: false,
            categoryPercentage: 0.62,
            barPercentage: 0.82,
            maxBarThickness: 26,
            order: 2,
          },
          {
            type: 'line',
            label: 'Saldo',
            data: data.map((point, index) => movementMask[index] ? point.balanceCents / 100 : null),
            borderColor: accent,
            backgroundColor: accent,
            borderWidth: 2,
            pointRadius: data.map((point, index) => point.ym === currentMonthYm && movementMask[index] ? 3 : 0),
            pointHoverRadius: 4,
            pointBackgroundColor: paper,
            pointBorderColor: accent,
            pointBorderWidth: 2,
            tension: 0.28,
            fill: false,
            spanGaps: false,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 80,
        animation: { duration: 280 },
        interaction: { mode: 'index', intersect: false },
        layout: { padding: isMobile ? { top: 6, right: 2, bottom: 0, left: 0 } : { top: 8, right: 6, bottom: 0, left: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            displayColors: true,
            backgroundColor: ink,
            titleColor: paper,
            bodyColor: paper,
            borderColor: line,
            borderWidth: 1,
            cornerRadius: 10,
            padding: 11,
            callbacks: {
              label: (context) => `${context.dataset.label}: ${formatCurrency(Number(context.raw ?? 0))}`,
            },
          },
        },
        scales: {
          x: {
            stacked: false,
            border: { display: false },
            grid: { display: false },
            ticks: {
              color: muted,
              font: { family: 'Manrope, sans-serif', size: isMobile ? 9 : 11, weight: 600 },
              padding: isMobile ? 5 : 8,
              maxRotation: 0,
              minRotation: 0,
            },
          },
          y: {
            display: !isMobile,
            beginAtZero: true,
            grace: '12%',
            border: { display: false },
            grid: { color: line, lineWidth: 1, drawTicks: false },
            ticks: {
              color: muted,
              maxTicksLimit: 5,
              padding: 8,
              font: { family: 'Manrope, sans-serif', size: 10, weight: 550 },
              callback: (value) => {
                const numeric = Number(value)
                if (!Number.isFinite(numeric)) return ''
                if (numeric === 0) return 'R$ 0'
                if (Math.abs(numeric) >= 1000) return `R$ ${(numeric / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
                return `R$ ${numeric.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
              },
            },
          },
        },
      },
    })
    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [currentMonthYm, data, formatCurrency, movementMask])

  const hasAnyMovement = movementMonths > 0

  return (
    <div ref={hostRef} className="finance40-chart-shell">
      <div className="finance40-chart-canvas" aria-label="Comparativo de entradas, saídas e saldo dos últimos seis meses">
        {hasAnyMovement ? <canvas ref={canvasRef} /> : null}
        {!hasAnyMovement ? (
          <div className="finance40-chart-empty">
            <strong>Seu histórico aparece aqui.</strong>
            <span>Registre movimentações para acompanhar entradas, saídas e saldo ao longo dos meses.</span>
          </div>
        ) : null}
      </div>
      <div className="finance40-chart-caption">
        <span>{movementMonths === 1 ? '1 mês com movimentação' : `${movementMonths} meses com movimentação`}</span>
        <small>{movementMonths <= 2 ? 'A leitura fica mais comparável conforme o histórico cresce.' : 'Toque ou passe o cursor pelo gráfico para ver os valores de cada mês.'}</small>
      </div>
      <table className="finance40-chart-table sr-only">
        <caption>Valores financeiros dos últimos seis meses</caption>
        <thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead>
        <tbody>{data.map((point) => <tr key={point.ym}><th>{point.label}</th><td>{formatCurrency(point.entriesCents / 100)}</td><td>{formatCurrency(point.expensesCents / 100)}</td><td>{formatCurrency(point.balanceCents / 100)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
