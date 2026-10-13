import { optimizeImageFile } from '../imageProcessing'
import type { AppointmentConfirmationStatus } from '../types'

export async function fileToOptimizedDataUrl(file: File) {
  return optimizeImageFile(file, { maxBytes: 255_000, maxDimension: 768, quality: .84 })
}

export function configuredPlatformBaseUrl() {
  const raw = String(import.meta.env.VITE_APP_BASE_URL ?? '').trim()
  if (!raw) return null
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

export function configuredPlatformHostname() {
  return configuredPlatformBaseUrl()?.hostname ?? 'seu-dominio.com.br'
}

export async function copyTextToClipboard(value: string) {
  if (!value) return false
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = value
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const copied = document.execCommand('copy')
      area.remove()
      return copied
    } catch {
      return false
    }
  }
}

export function configuredExternalLink(raw: unknown) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export function withBasePath(basePath: string, path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return basePath ? `${basePath}${normalized}` : normalized
}

const bundledServiceCovers = {
  classico: '/services/service-classico.webp', hibrido: '/services/service-hibrido.webp', brasileiro: '/services/service-volume-brasileiro.webp',
  mega: '/services/service-mega-volume.webp', lifting: '/services/service-lash-lifting.webp', manutencao: '/services/service-manutencao.webp',
} as const

export function bundledServiceCover(name: string) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (normalized.includes('mega')) return bundledServiceCovers.mega
  if (normalized.includes('lifting') || normalized.includes('lift')) return bundledServiceCovers.lifting
  if (normalized.includes('manut') || normalized.includes('retorno')) return bundledServiceCovers.manutencao
  if (normalized.includes('brasileir')) return bundledServiceCovers.brasileiro
  if (normalized.includes('hibrid')) return bundledServiceCovers.hibrido
  return bundledServiceCovers.classico
}

export function appointmentPresenceMeta(rawStatus: string, confirmationStatus?: AppointmentConfirmationStatus, attendanceStatus?:string) {
  if (rawStatus.trim().toUpperCase() === 'CANCELLED') return { label: 'Cancelado', className: 'status-warning', color: 'var(--status-neutral-bg)', textColor: 'var(--status-neutral-ink)' }
  if (attendanceStatus==='ATTENDED') return {label:'Compareceu',className:'status-success',color:'var(--status-success-bg)',textColor:'var(--status-success-ink)'}
  if (attendanceStatus==='NO_SHOW') return {label:'Faltou',className:'status-warning',color:'var(--status-warning-bg)',textColor:'var(--status-warning-ink)'}
  if (confirmationStatus === 'CONFIRMED' || confirmationStatus === 'MANUALLY_CONFIRMED') return { label: 'Presença confirmada', className: 'status-success', color: 'var(--status-success-bg)', textColor: 'var(--status-success-ink)' }
  if (confirmationStatus === 'AWAITING_CONFIRMATION') return { label: 'Aguardando resposta', className: 'status-pending', color: 'var(--status-warning-bg)', textColor: 'var(--status-warning-ink)' }
  if (confirmationStatus === 'NO_RESPONSE') return { label: 'Sem resposta', className: 'status-warning', color: 'var(--status-warning-bg)', textColor: 'var(--status-warning-ink)' }
  if (confirmationStatus === 'DELIVERY_FAILED') return { label: 'Falha no envio', className: 'status-warning', color: 'var(--status-danger-bg)', textColor: 'var(--status-danger-ink)' }
  if (confirmationStatus === 'DECLINED') return { label: 'Não poderá ir', className: 'status-warning', color: 'var(--status-danger-bg)', textColor: 'var(--status-danger-ink)' }
  return { label: 'Agendado', className: 'status-info', color: 'var(--status-info-bg)', textColor: 'var(--status-info-ink)' }
}

const financeMonthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
export function financeMonthLabel(ym: string) {
  const month = Number(ym.split('-')[1])
  return Number.isInteger(month) && month >= 1 && month <= 12 ? financeMonthLabels[month - 1] : ym
}

export function formatBRL(value: number) {
  return `R$${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
