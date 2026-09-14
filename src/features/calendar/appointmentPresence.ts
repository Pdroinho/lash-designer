import type { AppointmentConfirmationStatus } from '../../types'

export function appointmentPresenceMeta(rawStatus: string, confirmationStatus?: AppointmentConfirmationStatus) {
  if (rawStatus.trim().toUpperCase() === 'CANCELLED') return { label: 'Cancelado', className: 'status-warning', color: 'var(--status-neutral-bg)', textColor: 'var(--status-neutral-ink)' }
  if (confirmationStatus === 'CONFIRMED' || confirmationStatus === 'MANUALLY_CONFIRMED') return { label: 'Presença confirmada', className: 'status-success', color: 'var(--status-success-bg)', textColor: 'var(--status-success-ink)' }
  if (confirmationStatus === 'AWAITING_CONFIRMATION') return { label: 'Aguardando resposta', className: 'status-pending', color: 'var(--status-warning-bg)', textColor: 'var(--status-warning-ink)' }
  if (confirmationStatus === 'NO_RESPONSE') return { label: 'Sem resposta', className: 'status-warning', color: 'var(--status-warning-bg)', textColor: 'var(--status-warning-ink)' }
  if (confirmationStatus === 'DELIVERY_FAILED') return { label: 'Falha no envio', className: 'status-warning', color: 'var(--status-danger-bg)', textColor: 'var(--status-danger-ink)' }
  if (confirmationStatus === 'DECLINED') return { label: 'Não poderá ir', className: 'status-warning', color: 'var(--status-danger-bg)', textColor: 'var(--status-danger-ink)' }
  return { label: 'Agendado', className: 'status-info', color: 'var(--status-info-bg)', textColor: 'var(--status-info-ink)' }
}
