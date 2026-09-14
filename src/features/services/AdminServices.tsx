import { useEffect, useRef, useState } from 'react'
import { Edit2, Image as ImageIcon, Plus, Trash2, X } from '../../components/Icons'
import { api } from '../../api'
import { confirmAction } from '../../components/FeedbackCenter'
import { ModalRoot } from '../../components/ModalRoot'
import { optimizeImageFile } from '../../imageProcessing'
import type { AdminService } from './types'

const bundledServiceCovers = {
  classico: '/services/service-classico.webp',
  hibrido: '/services/service-hibrido.webp',
  brasileiro: '/services/service-volume-brasileiro.webp',
  mega: '/services/service-mega-volume.webp',
  lifting: '/services/service-lash-lifting.webp',
  manutencao: '/services/service-manutencao.webp',
} as const

function bundledServiceCover(name: string) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (normalized.includes('mega')) return bundledServiceCovers.mega
  if (normalized.includes('lifting') || normalized.includes('lift')) return bundledServiceCovers.lifting
  if (normalized.includes('manut') || normalized.includes('retorno')) return bundledServiceCovers.manutencao
  if (normalized.includes('brasileir')) return bundledServiceCovers.brasileiro
  if (normalized.includes('hibrid')) return bundledServiceCovers.hibrido
  return bundledServiceCovers.classico
}

function EmptyState(props: { image: string; title: string; description?: string; compact?: boolean }) {
  return (
    <div className={`empty-state ${props.compact ? 'compact' : ''}`}>
      <img decoding="async" src={props.image} alt="" aria-hidden="true" loading="lazy" />
      <strong>{props.title}</strong>
      {props.description ? <span>{props.description}</span> : null}
    </div>
  )
}

function formatBRL(value: number) {
  return 'R$' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function AdminServices() {
    const [services, setServices] = useState<AdminService[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [newService, setNewService] = useState({ name: '', duration: 60, price: 0, coverUrl: '' })
    const [saving, setSaving] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    const coverFileInputRef = useRef<HTMLInputElement | null>(null)
    const [coverBusy, setCoverBusy] = useState(false)
    const [, setCoverFileName] = useState<string | null>(null)
    const [coverError, setCoverError] = useState<string | null>(null)
    const [coverDragOver, setCoverDragOver] = useState(false)

    useEffect(() => {
        load()
    }, [])

    async function load() {
        setLoading(true)
        const res = await api<{services: AdminService[]}>('/api/admin/services')
        if(res.ok) setServices(res.data.services)
        setLoading(false)
    }

    function openCreateModal() {
        setCoverBusy(false)
        setCoverFileName(null)
        setCoverError(null)
        setEditingId(null)
        setNewService({ name: '', duration: 60, price: 0, coverUrl: '' })
        if (coverFileInputRef.current) coverFileInputRef.current.value = ''
        setModalOpen(true)
    }

    function openEditModal(s: AdminService) {
        setCoverBusy(false)
        setCoverFileName(null)
        setCoverError(null)
        setEditingId(s.id)
        setNewService({
            name: s.name,
            duration: s.durationMinutes,
            price: s.priceCents / 100,
            coverUrl: s.coverUrl || ''
        })
        if (coverFileInputRef.current) coverFileInputRef.current.value = ''
        setModalOpen(true)
    }

    async function handleDelete() {
        if (!editingId || !(await confirmAction({ title: 'Excluir serviço', message: 'Este serviço deixará de aparecer para novas clientes. Agendamentos existentes serão preservados.', confirmLabel: 'Excluir serviço', danger: true }))) return
        setSaving(true)
        await api(`/api/admin/services/${editingId}`, { method: 'DELETE' })
        setSaving(false)
        setModalOpen(false)
        load()
    }

    async function fileToOptimizedDataUrl(file: File) {
        return optimizeImageFile(file, { maxBytes: 255_000, maxDimension: 768, quality: .84 })
    }

    async function handleCoverFile(file: File) {
        setCoverBusy(true)
        setCoverError(null)
        try {
            if (!file.type.startsWith('image/')) {
                setCoverError('Arquivo inválido (envie uma imagem)')
                return
            }
            const dataUrl = await fileToOptimizedDataUrl(file)
            if (!dataUrl.startsWith('data:image/')) {
                setCoverError('Falha ao processar a imagem')
                return
            }
            if (dataUrl.length > 350_000) {
                setCoverError('Imagem muito grande. Use uma menor.')
                return
            }
            setCoverFileName(file.name)
            setNewService((s) => ({ ...s, coverUrl: dataUrl }))
        } catch {
            setCoverError('Falha ao processar a imagem')
        } finally {
            setCoverBusy(false)
        }
    }

    async function handleSave() {
        setSaving(true)
        const payload: { name: string; durationMinutes: number; priceCents: number; coverUrl?: string | null } = {
            name: newService.name,
            durationMinutes: Number(newService.duration),
            priceCents: Math.round(Number(newService.price) * 100)
        }
        if (newService.coverUrl) payload.coverUrl = newService.coverUrl
        else if (editingId && !newService.coverUrl) payload.coverUrl = null

        if (editingId) {
            await api(`/api/admin/services/${editingId}`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            })
        } else {
            await api('/api/admin/services', {
                method: 'POST',
                body: JSON.stringify(payload)
            })
        }

        setSaving(false)
        setModalOpen(false)
        load()
    }

    return (
        <>
            <div className="card service-admin-page">
                <div className="cardHeader service-admin-header">
                    <div>
                        <h2 className="cardTitle">Serviços</h2>
                        <p style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4}}>Gerencie os serviços oferecidos no seu espaço.</p>
                    </div>
                    <button type="button" className="btn btnPrimary service-create-button" onClick={openCreateModal}>
                        <Plus size={16} /> Novo serviço
                    </button>
                </div>

                {loading ? (
                    <div style={{padding: 20}}>
                        <div className="skeleton skeleton-card" style={{height: 160}} />
                    </div>
                ) : (
                    <div className="table-scroll service-desktop-table">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Capa</th>
                                    <th>Nome</th>
                                    <th>Duração</th>
                                    <th>Preço</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {services.map(s => (
                                    <tr key={s.id}>
                                        <td>
                                            <img decoding="async"
                                                className="service-cover-thumb"
                                                src={s.coverUrl || bundledServiceCover(s.name)}
                                                alt=""
                                                loading="lazy"
                                                onError={(event) => { event.currentTarget.src = '/placeholders/service-placeholder.webp' }}
                                            />
                                        </td>
                                        <td style={{fontWeight: 600, color: 'var(--gray-800)'}}>{s.name}</td>
                                        <td><span className="pill" style={{fontSize: '0.8rem'}}>{s.durationMinutes} min</span></td>
                                        <td style={{fontWeight: 500}}>R$ {(s.priceCents/100).toFixed(2)}</td>
                                        <td>
                                            <button type="button" className="icon-btn" style={{width: 32, height: 32}} onClick={() => openEditModal(s)} aria-label={`Editar serviço ${s.name}`}><Edit2 size={16}/></button>
                                        </td>
                                    </tr>
                                ))}
                                {services.length === 0 && (
                                    <tr><td colSpan={5}><EmptyState compact image="/empty-states/empty-calendar.png" title="Nenhum serviço cadastrado" description="Crie o primeiro serviço e escolha uma das capas incluídas no kit visual." /></td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
                {!loading ? <div className="service-mobile-list" aria-label="Serviços cadastrados">
                    {services.map((service) => <article className="service-mobile-card" key={`mobile-${service.id}`}>
                        <img decoding="async" src={service.coverUrl || bundledServiceCover(service.name)} alt="" loading="lazy" onError={(event) => { event.currentTarget.src = '/placeholders/service-placeholder.webp' }} />
                        <div className="service-mobile-copy"><strong>{service.name}</strong><div className="service-mobile-meta"><span>{service.durationMinutes} min</span><b>R$ {(service.priceCents / 100).toFixed(2)}</b></div></div>
                        <button type="button" className="icon-btn service-mobile-edit" onClick={() => openEditModal(service)} aria-label={`Editar serviço ${service.name}`}><Edit2 size={17}/></button>
                    </article>)}
                    {services.length === 0 ? <EmptyState compact image="/empty-states/empty-calendar.png" title="Nenhum serviço cadastrado" description="Crie o primeiro serviço para começar a receber horários." /> : null}
                </div> : null}
            </div>

            {modalOpen && (
                <ModalRoot className="modal-overlay" onClick={() => setModalOpen(false)}>
                    <div className="ld-dialog service-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="service-dialog-title" onClick={e => e.stopPropagation()}>
                        <div className="cardHeader" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                            <h3 id="service-dialog-title" className="cardTitle">{editingId ? 'Editar Serviço' : 'Novo Serviço'}</h3>
                            <button type="button" className="icon-btn" onClick={() => setModalOpen(false)} style={{width: 32, height: 32, border: 'none'}} aria-label="Fechar edição de serviço">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="cardBody">
                            <div className="form-stack">
                                <div className="input-group">
                                    <label className="label">Capa do Serviço (Opcional)</label>
                                    <div
                                        className={`cover-uploader ${coverDragOver ? 'dragover' : ''}`}
                                        onDragOver={(e) => { e.preventDefault(); setCoverDragOver(true) }}
                                        onDragLeave={() => setCoverDragOver(false)}
                                        onDrop={(e) => {
                                            e.preventDefault()
                                            setCoverDragOver(false)
                                            const f = e.dataTransfer.files?.[0]
                                            if (f) handleCoverFile(f)
                                        }}
                                        style={{
                                            border: `2px dashed ${coverDragOver ? 'var(--primary-500)' : 'var(--gray-300)'}`,
                                            borderRadius: 'var(--radius-md)',
                                            background: coverDragOver ? 'var(--primary-50)' : 'var(--bg-subtle)',
                                            transition: 'all 0.2s ease',
                                            cursor: coverBusy ? 'wait' : 'pointer',
                                            position: 'relative',
                                            overflow: 'hidden',
                                            height: 200,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            textAlign: 'center'
                                        }}
                                        onClick={() => !coverBusy && coverFileInputRef.current?.click()}
                                        onKeyDown={(event) => {
                                            if (!coverBusy && (event.key === 'Enter' || event.key === ' ')) {
                                                event.preventDefault()
                                                coverFileInputRef.current?.click()
                                            }
                                        }}
                                        role="button"
                                        tabIndex={coverBusy ? -1 : 0}
                                        aria-disabled={coverBusy}
                                        aria-label="Selecionar capa do serviço"
                                    >
                                        {coverBusy && (
                                            <div style={{
                                                position: 'absolute',
                                                inset: 0,
                                                background: 'rgba(255,255,255,0.8)',
                                                zIndex: 10,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <div className="spinner" />
                                            </div>
                                        )}

                                        {newService.coverUrl ? (
                                            <>
                                                <img decoding="async"
                                                    src={newService.coverUrl}
                                                    alt="Capa do serviço"
                                                    style={{width: '100%', height: '100%', objectFit: 'cover'}}
                                                    onError={() => setCoverError('Imagem inválida')}
                                                />
                                                <div
                                                    className="cover-actions-overlay"
                                                    style={{
                                                        position: 'absolute',
                                                        inset: 0,
                                                        background: 'rgba(0,0,0,0.4)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: 12,
                                                        opacity: 0,
                                                        transition: 'opacity 0.2s',
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                    onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                                                >
                                                    <button
                                                        type="button"
                                                        className="btn"
                                                        style={{background: 'var(--surface-raised)', border: 'none', color: 'var(--ink-strong)', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'}}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            coverFileInputRef.current?.click()
                                                        }}
                                                    >
                                                        Trocar imagem
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn"
                                                        aria-label="Remover capa do serviço"
                                                        title="Remover capa"
                                                        style={{background: 'var(--status-danger-bg)', color: 'var(--danger-strong)', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'}}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setCoverError(null)
                                                            setCoverFileName(null)
                                                            setNewService((s) => ({ ...s, coverUrl: '' }))
                                                            if (coverFileInputRef.current) coverFileInputRef.current.value = ''
                                                        }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{padding: 24, pointerEvents: 'none'}}>
                                                <div style={{
                                                    width: 48,
                                                    height: 48,
                                                    background: 'var(--gray-100)',
                                                    borderRadius: '50%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    margin: '0 auto 12px',
                                                    color: 'var(--primary-600)'
                                                }}>
                                                    <ImageIcon size={24} />
                                                </div>
                                                <div style={{fontWeight: 600, color: 'var(--gray-700)', marginBottom: 4}}>
                                                    Adicionar capa
                                                </div>
                                                <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>
                                                    Arraste ou clique para enviar
                                                </div>
                                            </div>
                                        )}

                                        <input
                                            ref={coverFileInputRef}
                                            type="file"
                                            accept="image/*"
                                            style={{display: 'none'}}
                                            onChange={(e) => {
                                                const f = e.target.files?.[0]
                                                if (!f) return
                                                handleCoverFile(f)
                                            }}
                                        />
                                    </div>
                                    {coverError && (
                                        <div style={{marginTop: 10, color: 'var(--danger)', fontSize: '0.85rem'}}>{coverError}</div>
                                    )}
                                </div>

                                <div className="input-group">
                                    <label className="label">Nome do Serviço</label>
                                    <div className="input-wrapper">
                                        <input
                                            className="input"
                                            value={newService.name}
                                            onChange={e => setNewService({...newService, name: e.target.value})}
                                            placeholder="Ex: Cílios Volume Russo"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="row">
                                    <div className="input-group">
                                        <label className="label">Duração (min)</label>
                                        <div className="input-wrapper">
                                            <input
                                                className="input"
                                                type="number"
                                                value={newService.duration}
                                                onChange={e => setNewService({...newService, duration: Number(e.target.value)})}
                                                min={1}
                                            />
                                        </div>
                                    </div>
                                    <div className="input-group">
                                        <label className="label">Preço (R$)</label>
                                        <div className="input-wrapper">
                                            <input
                                                className="input"
                                                type="text"
                                                inputMode="decimal"
                                                autoComplete="off"
                                                placeholder="R$0,00"
                                                value={formatBRL(newService.price)}
                                                onChange={e => {
                                                    const digits = e.target.value.replace(/\D/g, '')
                                                    const units = digits ? parseInt(digits, 10) / 100 : 0
                                                    setNewService({ ...newService, price: units })
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="row" style={{marginTop: 10}}>
                                    {editingId && (
                                        <button type="button" className="btn" aria-label="Excluir serviço" title="Excluir serviço" style={{color: 'var(--danger)', borderColor: 'var(--danger-border)', marginRight: 'auto'}} onClick={handleDelete} disabled={saving}>
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                    <button type="button" className="btn" data-modal-close onClick={() => setModalOpen(false)}>Cancelar</button>
                                    <button type="button" className="btn btnPrimary" onClick={handleSave} disabled={saving}>
                                        {saving ? 'Salvando...' : (editingId ? 'Salvar Alterações' : 'Criar')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </ModalRoot>
            )}
        </>
    )
}

