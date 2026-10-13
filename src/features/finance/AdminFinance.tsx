import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { api } from '../../api'
import type { AdminFinanceData } from '../shared/types'
import { financeMonthLabel, formatBRL } from '../../lib/runtime'
import { confirmAction, notify } from '../../components/FeedbackCenter'
import { EmptyState } from '../../components/SharedUi'
import { FinanceFlowChart } from '../../components/FinanceFlowChart'
import { ProductSelect } from '../../components/ProductSelect'
import { ModalRoot } from '../../components/ModalRoot'
import { ArrowRight, BarChart3, Download, Edit2, Plus, Sparkles, Trash2, Wallet, X } from '../../components/Icons'

export function AdminFinance() {
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
    const [finance, setFinance] = useState<AdminFinanceData | null>(null)
    const [showTransactionModal, setShowTransactionModal] = useState(false)
    const [showExtractModal, setShowExtractModal] = useState(false)
    const [showGoalsModal, setShowGoalsModal] = useState(false)
    const filters = ['all', 'income', 'expense'] as const

    const loadData = () => {
        setLoading(true)
        api<AdminFinanceData>('/api/admin/finance').then(res => {
            if (res.ok) setFinance(res.data)
            setLoading(false)
        })
    }

    useEffect(() => {
        loadData()
    }, [])

    if (loading && !finance) {
        return (
            <div className="finance36-loading">
                <div className="spinner" />
            </div>
        )
    }

    if (!finance) {
        return <EmptyState image="/empty-states/empty-finance.png" title="Financeiro indisponível" description="Não foi possível carregar os dados financeiros agora." />
    }

    const current = finance.currentMonth
    const previous = finance.previousMonth
    const growth = previous.entriesCents > 0
        ? Number((((current.entriesCents - previous.entriesCents) / previous.entriesCents) * 100).toFixed(1))
        : null
    const expenseRatio = current.entriesCents > 0 ? (current.expensesCents / current.entriesCents) * 100 : 0
    const averageTicket = current.confirmedAppointments > 0 ? current.serviceEntriesCents / current.confirmedAppointments : 0
    const revenueGoalPercent = finance.goals.revenueCents > 0 ? Math.min(100, (finance.goals.currentRevenueCents / finance.goals.revenueCents) * 100) : 0
    const clientGoalPercent = finance.goals.newClients > 0 ? Math.min(100, (finance.goals.currentNewClients / finance.goals.newClients) * 100) : 0
    const activeMonthLabel = financeMonthLabel(finance.currentMonthYm)
    const monthlyFlow = finance.monthly.map((month) => ({
        ...month,
        label: financeMonthLabel(month.ym),
    }))

    const formatFinanceDate = (value: string) => {
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return value
        return new Intl.DateTimeFormat('pt-BR', {
            timeZone: finance.timeZone,
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date).replace('.', '')
    }

    const transactions = [
        ...finance.lastEntries.map(a => ({
            id: `in_${a.id}`,
            title: a.clientName ?? a.clientEmail,
            subtitle: a.serviceName,
            type: 'income' as const,
            amount: a.priceCents,
            at: a.startsAt,
            dateText: formatFinanceDate(a.startsAt),
            category: 'Serviço',
        })),
        ...finance.lastCashTransactions.map(e => ({
            id: `cash_${e.id}`,
            title: e.note?.trim() ? e.note.trim() : (e.type === 'INCOME' ? 'Entrada manual' : 'Saída manual'),
            subtitle: e.type === 'INCOME' ? 'Movimentação adicionada' : 'Despesa registrada',
            type: e.type.toLowerCase() as 'income' | 'expense',
            amount: e.amountCents,
            at: e.createdAt,
            dateText: formatFinanceDate(e.createdAt),
            category: e.method || 'Manual',
        })),
    ].sort((a, b) => b.at.localeCompare(a.at))

    const filteredTransactions = transactions.filter(t => filter === 'all' || t.type === filter).slice(0, 20)

    const handleDeleteTransaction = async (id: string) => {
        if (!id.startsWith('cash_')) return
        if (!(await confirmAction({ title: 'Excluir movimentação', message: 'A movimentação será removida do financeiro e dos totais apresentados.', confirmLabel: 'Excluir movimentação', danger: true }))) return
        const rawId = id.replace('cash_', '')
        const res = await api<{ ok: true }>(`/api/admin/finance/transactions/${rawId}`, { method: 'DELETE' })
        if (res.ok) loadData()
        else notify('Erro ao excluir: ' + (res.error?.message || 'Desconhecido'), 'error')
    }

    const askLuma = (prompt: string) => {
        window.dispatchEvent(new CustomEvent('lashdesigner:luma-open', { detail: { prompt } }))
    }

    return (
        <div className="finance36">
            <section className="finance36-hero">
                <div className="finance36-hero-copy">
                    <span className="finance36-eyebrow">Controle financeiro · {activeMonthLabel}</span>
                    <h2>Entenda o mês sem fazer conta na cabeça.</h2>
                    <p>Entradas confirmadas, movimentações manuais, despesas e metas reunidas na mesma leitura.</p>
                </div>
                <div className="finance36-actions">
                    <button type="button" className="finance36-btn is-primary" onClick={() => setShowTransactionModal(true)}>
                        <Plus size={16} /> Nova movimentação
                    </button>
                    <button type="button" className="finance36-btn" onClick={() => setShowExtractModal(true)}>
                        <Download size={16} /> Extrato
                    </button>
                    <button type="button" className="finance36-btn is-luma" onClick={() => askLuma('Analise meu financeiro deste mês. Compare com o mês anterior, destaque o que merece atenção e me dê no máximo 3 próximos passos práticos.')}>
                        <Sparkles size={16} /> Analisar com Luma
                    </button>
                </div>
            </section>

            <section className="finance36-kpis" aria-label="Resumo financeiro do mês">
                <article className="finance36-kpi is-income">
                    <span>Entradas do mês</span>
                    <strong>{formatBRL(current.entriesCents / 100)}</strong>
                    <small className={growth === null || growth >= 0 ? 'is-positive' : 'is-negative'}>{growth === null ? 'Mês anterior sem entradas para comparar' : `${growth >= 0 ? '+' : ''}${growth}% vs. ${financeMonthLabel(previous.ym)}`}</small>
                </article>
                <article className="finance36-kpi is-expense">
                    <span>Saídas do mês</span>
                    <strong>{formatBRL(current.expensesCents / 100)}</strong>
                    <small>{expenseRatio.toFixed(1).replace('.', ',')}% das entradas registradas</small>
                </article>
                <article className="finance36-kpi is-balance">
                    <span>Saldo do mês</span>
                    <strong>{formatBRL(current.balanceCents / 100)}</strong>
                    <small>Entradas registradas − saídas registradas</small>
                </article>
                <article className="finance36-kpi is-goal">
                    <span>Meta de faturamento</span>
                    <strong>{finance.goals.revenueCents > 0 ? `${Math.round(revenueGoalPercent)}%` : 'Definir meta'}</strong>
                    <div className="finance36-mini-progress"><i style={{ width: `${revenueGoalPercent}%` }} /></div>
                    <small>{finance.goals.revenueCents > 0 ? `${formatBRL(finance.goals.currentRevenueCents / 100)} de ${formatBRL(finance.goals.revenueCents / 100)}` : 'Informe uma meta mensal para acompanhar o progresso'}</small>
                </article>
            </section>

            <div className="finance36-primary-grid">
                <section className="finance36-panel finance36-flow-panel">
                    <header className="finance36-panel-head">
                        <div>
                            <span className="finance36-panel-kicker">Últimos 6 meses</span>
                            <h3>Entradas x saídas</h3>
                        </div>
                        <div className="finance36-legend" aria-label="Legenda do gráfico">
                            <span><i className="is-entry" />Entradas</span>
                            <span><i className="is-expense" />Saídas</span>
                            <span><i className="is-balance" />Saldo</span>
                        </div>
                    </header>
                    <FinanceFlowChart
                        data={monthlyFlow}
                        currentMonthYm={finance.currentMonthYm}
                        formatCurrency={formatBRL}
                    />
                </section>

                <aside className="finance36-panel finance36-reading">
                    <header className="finance36-panel-head">
                        <div>
                            <span className="finance36-panel-kicker">Leitura do mês</span>
                            <h3>De onde o número vem</h3>
                        </div>
                        <BarChart3 size={19} />
                    </header>
                    <div className="finance36-reading-list">
                        <div><span>Serviços confirmados</span><strong>{formatBRL(current.serviceEntriesCents / 100)}</strong></div>
                        <div><span>Entradas manuais</span><strong>{formatBRL(current.manualIncomeCents / 100)}</strong></div>
                        <div><span>Ticket médio dos serviços</span><strong>{formatBRL(averageTicket / 100)}</strong></div>
                        <div><span>Agendamentos confirmados</span><strong>{current.confirmedAppointments}</strong></div>
                    </div>
                    <button type="button" className="finance36-luma-card" onClick={() => askLuma('Explique de forma simples a composição do meu financeiro deste mês: serviços confirmados, entradas manuais, despesas e saldo. Aponte qualquer sinal fora do normal.') }>
                        <span><Sparkles size={16} /> Perguntar à Luma sobre estes números</span>
                        <ArrowRight size={15} />
                    </button>
                    <p className="finance36-definition">Saldo não é lucro contábil: ele representa as entradas e saídas que estão registradas no Lash Designer.</p>
                </aside>
            </div>

            <div className="finance36-secondary-grid">
                <section className="finance36-panel finance36-transactions">
                    <header className="finance36-panel-head finance36-transactions-head">
                        <div>
                            <span className="finance36-panel-kicker">Movimentação</span>
                            <h3>Últimos registros</h3>
                        </div>
                        <div className="finance36-filter-group">
                            {filters.map(f => (
                                <button type="button" key={f} onClick={() => setFilter(f)} className={filter === f ? 'is-active' : ''}>
                                    {f === 'all' ? 'Tudo' : f === 'income' ? 'Entradas' : 'Saídas'}
                                </button>
                            ))}
                        </div>
                    </header>
                    <div className="finance36-transaction-list">
                        {filteredTransactions.length === 0 ? (
                            <EmptyState compact image="/empty-states/empty-finance.png" title="Nada por aqui ainda" description="Os registros financeiros do período aparecerão nesta lista." />
                        ) : filteredTransactions.map((transaction) => (
                            <article className="finance36-transaction" key={transaction.id}>
                                <div className={`finance36-transaction-sign ${transaction.type}`} aria-hidden="true">{transaction.type === 'income' ? '+' : '−'}</div>
                                <div className="finance36-transaction-copy">
                                    <strong>{transaction.title}</strong>
                                    <span>{transaction.subtitle} · {transaction.category}</span>
                                </div>
                                <time>{transaction.dateText}</time>
                                <strong className={`finance36-transaction-value ${transaction.type}`}>{transaction.type === 'income' ? '+' : '−'}{formatBRL(transaction.amount / 100)}</strong>
                                {transaction.id.startsWith('cash_') ? (
                                    <button type="button" className="finance36-delete" onClick={() => handleDeleteTransaction(transaction.id)} aria-label="Excluir movimentação" title="Excluir movimentação">
                                        <Trash2 size={15} />
                                    </button>
                                ) : <span className="finance36-delete-placeholder" />}
                            </article>
                        ))}
                    </div>
                    <button type="button" className="finance36-inline-action" onClick={() => setShowExtractModal(true)}>Abrir extrato completo <ArrowRight size={14} /></button>
                </section>

                <aside className="finance36-side-stack">
                    <section className="finance36-panel finance36-goals">
                        <header className="finance36-panel-head">
                            <div>
                                <span className="finance36-panel-kicker">Metas</span>
                                <h3>Ritmo do mês</h3>
                            </div>
                            <button type="button" className="finance36-icon-btn" onClick={() => setShowGoalsModal(true)} aria-label="Editar metas"><Edit2 size={15} /></button>
                        </header>
                        <div className="finance36-goal">
                            <div><span>Faturamento</span><strong>{finance.goals.revenueCents > 0 ? `${Math.round(revenueGoalPercent)}%` : 'Definir meta'}</strong></div>
                            <div className="finance36-progress"><i style={{ width: `${revenueGoalPercent}%` }} /></div>
                            <small>{finance.goals.revenueCents > 0 ? `${formatBRL(finance.goals.currentRevenueCents / 100)} de ${formatBRL(finance.goals.revenueCents / 100)}` : 'Informe uma meta mensal para acompanhar o progresso'}</small>
                        </div>
                        <div className="finance36-goal is-client">
                            <div><span>Novos clientes</span><strong>{finance.goals.newClients > 0 ? `${Math.round(clientGoalPercent)}%` : 'Definir meta'}</strong></div>
                            <div className="finance36-progress"><i style={{ width: `${clientGoalPercent}%` }} /></div>
                            <small>{finance.goals.currentNewClients} de {finance.goals.newClients} clientes</small>
                        </div>
                        <button type="button" className="finance36-inline-action" onClick={() => askLuma('Com base no meu financeiro atual e nas minhas metas deste mês, o que eu deveria priorizar para chegar mais perto da meta sem depender de descontos?')}>Como chegar na meta? <Sparkles size={14} /></button>
                    </section>

                    <section className="finance36-panel finance36-expenses">
                        <header className="finance36-panel-head">
                            <div>
                                <span className="finance36-panel-kicker">Saídas</span>
                                <h3>Principais categorias</h3>
                            </div>
                            <Wallet size={18} />
                        </header>
                        {finance.expenseCategories.length ? (
                            <div className="finance36-expense-list">
                                {finance.expenseCategories.map((category) => {
                                    const pct = current.expensesCents > 0 ? (category.amountCents / current.expensesCents) * 100 : 0
                                    return (
                                        <div key={category.label}>
                                            <div><span>{category.label}</span><strong>{formatBRL(category.amountCents / 100)}</strong></div>
                                            <div className="finance36-expense-track"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <p className="finance36-empty-copy">Nenhuma saída manual foi registrada em {activeMonthLabel}.</p>
                        )}
                    </section>
                </aside>
            </div>

            {showTransactionModal && <NewTransactionModal isOpen={true} onClose={() => setShowTransactionModal(false)} onSuccess={loadData} todayYmd={finance.todayYmd} />}
            {showExtractModal && <ExtractModal isOpen={true} onClose={() => setShowExtractModal(false)} todayYmd={finance.todayYmd} currentMonthYm={finance.currentMonthYm} timeZone={finance.timeZone} />}
            {showGoalsModal && (
                <GoalsModal
                    isOpen={true}
                    onClose={() => setShowGoalsModal(false)}
                    onSuccess={loadData}
                    initialRevenue={finance.goals.revenueCents}
                    initialNewClients={finance.goals.newClients}
                />
            )}
        </div>
    )
}

function NewTransactionModal({ isOpen, onClose, onSuccess, todayYmd }: { isOpen: boolean; onClose: () => void; onSuccess: () => void; todayYmd: string }) {
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayYmd)


  useEffect(() => {
    if (isOpen) setDate(todayYmd)
  }, [isOpen, todayYmd])


  function handleAmountChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.replace(/\D/g, '')
    if (!value) {
      setAmount('')
      return
    }
    const numberValue = Number(value) / 100
    setAmount(numberValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const parsedAmount = Math.round(Number(amount.replace(/\./g, '').replace(',', '.')) * 100)
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        notify('Informe um valor maior que zero.', 'warning')
        setLoading(false)
        return
      }

      const res = await api('/api/admin/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type,
          amountCents: parsedAmount,
          method: method.trim() || undefined,
          note: note.trim() || undefined,
          date
        })
      })

      if (!res.ok) {
        throw new Error(res.error?.message || 'Erro ao salvar')
      }

      onSuccess()
      onClose()
      // Reset form
      setAmount('')
      setMethod('')
      setNote('')
      setDate(todayYmd)
    } catch (err) {
      console.error(err)
      notify('Erro ao salvar movimentação: ' + (err as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <ModalRoot className="modal-overlay" onClick={onClose}>
      <div className="ld-dialog finance36-dialog finance40-transaction-dialog" role="dialog" aria-modal="true" aria-labelledby="transaction-dialog-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="finance40-dialog-kicker">Financeiro</span>
            <h3 id="transaction-dialog-title" className="modal-title">Nova movimentação</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar janela"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body finance40-transaction-form">
            <div className="finance40-form-stack">
                <div className="finance40-form-grid">
                    <div className="input-group">
                        <label className="label">Tipo</label>
                        <ProductSelect
                            value={type}
                            onChange={(next) => setType(next as 'INCOME' | 'EXPENSE')}
                            ariaLabel="Tipo da movimentação"
                            options={[
                                { value: 'INCOME', label: 'Receita (Entrada)' },
                                { value: 'EXPENSE', label: 'Despesa (Saída)' },
                            ]}
                        />
                    </div>
                    <div className="input-group">
                        <label className="label">Data</label>
                        <input
                            className="input finance40-control"
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            required
                            lang="pt-BR"
                        />
                    </div>
                </div>
                <div className="input-group">
                    <label className="label">Valor (R$)</label>
                    <input className="input finance40-control" inputMode="decimal" autoComplete="off" value={amount} onChange={handleAmountChange} placeholder="0,00" required />
                </div>
                <div className="input-group">
                    <label className="label">Categoria ou método</label>
                    <input className="input finance40-control" value={method} onChange={e => setMethod(e.target.value)} placeholder="Ex.: Pix, aluguel, produtos" />
                </div>
                <div className="input-group">
                    <label className="label">Descrição <span className="text-muted">(opcional)</span></label>
                    <textarea className="input finance40-control finance40-textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="Detalhes da movimentação" rows={3} />
                </div>
            </div>
            <div className="modal-footer finance40-dialog-footer">
                <button type="button" className="btn" data-modal-close onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn btnPrimary" disabled={loading}>
                    {loading ? 'Salvando…' : 'Salvar movimentação'}
                </button>
            </div>
        </form>
      </div>
    </ModalRoot>
  )
}

function ExtractModal({ isOpen, onClose, todayYmd, currentMonthYm, timeZone }: { isOpen: boolean; onClose: () => void; todayYmd: string; currentMonthYm: string; timeZone: string }) {
  const [loading, setLoading] = useState(false)
  type FinanceTransactionRow = {
    id: string
    date: string
    description: string | null
    category: string | null
    type: 'INCOME' | 'EXPENSE'
    amountCents: number
    status: string
  }
  const [transactions, setTransactions] = useState<FinanceTransactionRow[]>([])
  const [start, setStart] = useState(() => `${currentMonthYm}-01`)
  const [end, setEnd] = useState(todayYmd)
  const [type, setType] = useState('all')

  useEffect(() => {
      if (!isOpen) return
      setStart(`${currentMonthYm}-01`)
      setEnd(todayYmd)
  }, [isOpen, currentMonthYm, todayYmd])

  useEffect(() => {
      if (isOpen) load()
  }, [isOpen, start, end, type])

  async function load() {
      setLoading(true)
      try {
          const res = await api<{ transactions: FinanceTransactionRow[] }>(
            `/api/admin/finance/extract?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&type=${encodeURIComponent(type)}`,
          )
          if (res.ok) setTransactions(res.data.transactions)
      } catch (err) {
          console.error(err)
      } finally {
          setLoading(false)
      }
  }

  function handleExport() {
      if (transactions.length === 0) return

      const csvCell = (value: unknown) => {
          let text = String(value ?? '')
          if (/^[=+\-@]/.test(text)) text = `'${text}`
          return `"${text.replace(/"/g, '""')}"`
      }

      const csvContent = [
          ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Status'],
          ...transactions.map(t => [
              new Intl.DateTimeFormat('pt-BR', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(t.date)),
              t.description || '-',
              t.category || '-',
              t.type === 'INCOME' ? 'Entrada' : 'Saída',
              (t.amountCents / 100).toFixed(2).replace('.', ','),
              t.status
          ])
      ].map(row => row.map(csvCell).join(';')).join('\n')

      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `extrato_${start}_${end}.csv`
      link.click()
      URL.revokeObjectURL(url)
  }

  if (!isOpen) return null

  return (
    <ModalRoot className="modal-overlay" onClick={onClose}>
      <div className="ld-dialog finance36-dialog finance36-dialog-wide finance40-extract-dialog" role="dialog" aria-modal="true" aria-labelledby="statement-dialog-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><span className="finance40-dialog-kicker">Financeiro</span><h3 id="statement-dialog-title" className="modal-title">Extrato financeiro</h3></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar janela"><X size={20} /></button>
        </div>
        <div className="modal-body">
            <div className="finance40-extract-filters">
                <div className="input-group">
                    <label className="label">Início</label>
                    <input className="input finance40-control is-compact" type="date" value={start} onChange={e => setStart(e.target.value)} />
                </div>
                <div className="input-group">
                    <label className="label">Fim</label>
                    <input className="input finance40-control is-compact" type="date" value={end} onChange={e => setEnd(e.target.value)} />
                </div>
                <div className="input-group">
                    <label className="label">Tipo</label>
                    <ProductSelect
                        value={type}
                        onChange={setType}
                        ariaLabel="Filtrar extrato por tipo"
                        size="compact"
                        options={[
                            { value: 'all', label: 'Todos' },
                            { value: 'income', label: 'Entradas' },
                            { value: 'expense', label: 'Saídas' },
                        ]}
                    />
                </div>
                <button type="button" className="btn finance40-export-btn" onClick={handleExport} disabled={transactions.length === 0}>
                    <Download size={15} /> Exportar CSV
                </button>
            </div>

            <div className="table-scroll finance40-extract-table">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Descrição</th>
                            <th>Categoria</th>
                            <th className="finance40-align-right">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="finance40-loading-cell">
                                    <div className="skeleton skeleton-text finance40-loading-line" />
                                </td>
                            </tr>
                        ) : transactions.length === 0 ? (
                            <tr><td colSpan={4}><EmptyState compact image="/empty-states/empty-finance.png" title="Nenhum registro financeiro" /></td></tr>
                        ) : transactions.map(t => (
                            <tr key={t.id}>
                                <td className="finance40-date-cell">{new Date(t.date).toLocaleDateString('pt-BR')} <span>{new Date(t.date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span></td>
                                <td className="finance40-description-cell">{t.description || 'Sem descrição'}</td>
                                <td><span className="pill">{t.category || '—'}</span></td>
                                <td className={`finance40-value-cell ${t.type === 'INCOME' ? 'is-income' : 'is-expense'}`}>
                                    {t.type === 'INCOME' ? '+' : '-'}{formatBRL(t.amountCents / 100)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </ModalRoot>
  )
}

function GoalsModal({ isOpen, onClose, onSuccess, initialRevenue, initialNewClients }: { isOpen: boolean; onClose: () => void; onSuccess: () => void; initialRevenue: number; initialNewClients: number }) {
    const [loading, setLoading] = useState(false)
    const [revenue, setRevenue] = useState(String(initialRevenue / 100))
    const [newClients, setNewClients] = useState(String(initialNewClients))

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setLoading(true)
        try {
            const revenueGoalCents = Math.round(Number(revenue.replace(',', '.')) * 100)
            const newClientsGoal = Number(newClients)
            if (!Number.isFinite(revenueGoalCents) || revenueGoalCents < 0 || !Number.isInteger(newClientsGoal) || newClientsGoal < 0) {
                throw new Error('Informe metas válidas e não negativas.')
            }
            const res = await api('/api/admin/finance/goals', {
                method: 'PATCH',
                body: JSON.stringify({ revenueGoalCents, newClientsGoal })
            })
            if (!res.ok) throw new Error(res.error?.message || 'Não foi possível salvar as metas.')
            onSuccess()
            onClose()
        } catch (err) {
            console.error(err)
            notify((err as Error).message || 'Erro ao salvar metas', 'error')
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <ModalRoot className="modal-overlay" onClick={onClose}>
            <div className="ld-dialog finance36-dialog" role="dialog" aria-modal="true" aria-labelledby="goals-dialog-title" style={{maxWidth: 400}} onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3 id="goals-dialog-title" className="modal-title">Definir Metas do Mês</h3>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar janela"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="modal-body">
                    <div className="form-stack">
                        <div className="input-group">
                            <label className="label">Meta de Faturamento (R$)</label>
                            <input className="input" value={revenue} onChange={e => setRevenue(e.target.value)} required />
                        </div>
                        <div className="input-group">
                            <label className="label">Meta de Novos Clientes</label>
                            <input className="input" type="number" value={newClients} onChange={e => setNewClients(e.target.value)} required />
                        </div>
                    </div>
                    <div className="modal-footer" style={{marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12}}>
                        <button type="button" className="btn" data-modal-close onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn btnPrimary" disabled={loading}>
                            {loading ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </form>
            </div>
        </ModalRoot>
    )
}

