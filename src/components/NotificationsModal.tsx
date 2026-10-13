import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SupportNotification } from '../features/support/types'
import { api } from '../api'
import type { SessionUser } from '../types'
import type { AdminStats, ClientAppointment } from '../features/shared/types'
import { appointmentPresenceMeta } from '../lib/runtime'
import { BellRing, CreditCard, MessageSquare, XCircle } from './Icons'

type NotificationItem = {
  id: string
  title: string
  desc: string
  time: string
  type: string
}

export function NotificationsModal({
  isOpen,
  onClose,
  role,
}: {
  isOpen: boolean
  onClose: () => void
  role?: SessionUser['role']
}) {
  const navigate = useNavigate()
  const [support, setSupport] = useState<SupportNotification[]>([])
  const [supportThrough, setSupportThrough] = useState(0)
  const [supportError, setSupportError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)

    let current = true
    setSupportError('')
    const load = async () => {
      if (role && ['DEV', 'ADMIN', 'STAFF'].includes(role)) {
        const supportResult = await api<{
          notifications: SupportNotification[]
          through: number
        }>('/api/support/notifications')
        if (!current) return
        if (supportResult.ok) {
          setSupport(
            supportResult.data.notifications.filter((item) => !item.readAt),
          )
          setSupportThrough(supportResult.data.through)
        } else setSupportError(supportResult.error.message)
      } else setSupport([])
      if (role === 'DEV') {
        const res = await api<{ notifications: NotificationItem[] }>(
          '/api/dev/notifications',
        )
        if (res.ok) setNotifications(res.data.notifications)
        return
      }
      if (role === 'ADMIN') {
        const res = await api<AdminStats>('/api/admin/dashboard')
        if (res.ok) {
          setNotifications(
            (res.data.upcoming ?? []).slice(0, 5).map((item) => {
              const presence = appointmentPresenceMeta(
                item.status,
                item.confirmationStatus,
              )
              return {
                id: item.id,
                title:
                  item.status === 'CANCELLED'
                    ? 'Agendamento cancelado'
                    : presence.label,
                desc: `${item.clientName ?? item.clientEmail} • ${item.serviceName}`,
                time: item.startsAt,
                type:
                  item.status === 'CANCELLED' ||
                  ['DECLINED', 'NO_RESPONSE', 'DELIVERY_FAILED'].includes(
                    item.confirmationStatus ?? '',
                  )
                    ? 'fail'
                    : ['CONFIRMED', 'MANUALLY_CONFIRMED'].includes(
                          item.confirmationStatus ?? '',
                        )
                      ? 'approved'
                      : 'message',
              }
            }),
          )
        }
        return
      }
      if (role === 'CLIENT') {
        const res = await api<{ appointments: ClientAppointment[] }>(
          '/api/client/appointments',
        )
        if (res.ok) {
          setNotifications(
            res.data.appointments.slice(0, 5).map((item) => {
              const presence = appointmentPresenceMeta(
                item.status,
                item.confirmationStatus,
              )
              return {
                id: item.id,
                title:
                  item.status === 'CANCELLED'
                    ? 'Agendamento cancelado'
                    : presence.label,
                desc: item.serviceName,
                time: item.startsAt,
                type:
                  item.status === 'CANCELLED' ||
                  item.confirmationStatus === 'DECLINED'
                    ? 'fail'
                    : ['CONFIRMED', 'MANUALLY_CONFIRMED'].includes(
                          item.confirmationStatus ?? '',
                        )
                      ? 'approved'
                      : 'message',
              }
            }),
          )
        }
      }
    }

    void load().finally(() => {
      if (current) setLoading(false)
    })
    return () => {
      current = false
    }
  }, [isOpen, role])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  async function markSupport(items: SupportNotification[], all = false) {
    if (!items.length && !all) return true
    const res = await api('/api/support/notifications', {
      method: 'PATCH',
      body: JSON.stringify(
        all
          ? { through: supportThrough }
          : { ids: items.map((item) => item.id) },
      ),
    })
    if (!res.ok) {
      setSupportError(res.error.message)
      return false
    }
    setSupport((previous) =>
      previous.filter((item) => !items.some((read) => read.id === item.id)),
    )
    window.dispatchEvent(new Event('support-notifications-updated'))
    return true
  }

  if (!isOpen) return null

  const getIcon = (type: string) => {
    const normalized = type.toLowerCase()
    if (normalized.includes('payment') || normalized.includes('approved'))
      return <CreditCard size={16} />
    if (normalized.includes('message')) return <MessageSquare size={16} />
    if (normalized.includes('fail') || normalized.includes('refused'))
      return <XCircle size={16} />
    return <BellRing size={16} />
  }

  const getTone = (type: string) => {
    const normalized = type.toLowerCase()
    if (normalized.includes('payment') || normalized.includes('approved'))
      return 'success'
    if (normalized.includes('message')) return 'message'
    if (normalized.includes('fail') || normalized.includes('refused'))
      return 'error'
    return 'neutral'
  }

  const relativeTime = (iso: string) => {
    try {
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return iso
      const diff = Date.now() - date.getTime()
      if (diff < 0)
        return date.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      const mins = Math.floor(diff / 60_000)
      if (mins < 1) return 'Agora'
      if (mins < 60) return `Há ${mins} min`
      const hours = Math.floor(mins / 60)
      if (hours < 24) return `Há ${hours} h`
      return date.toLocaleDateString('pt-BR')
    } catch {
      return iso
    }
  }

  return (
    <div
      ref={ref}
      className="notifications-popover"
      role="dialog"
      aria-label="Notificações"
    >
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
          Notificações
        </h3>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: '0.75rem', height: 24, padding: '0 8px' }}
          onClick={async () => {
            if (await markSupport(support, true)) setNotifications([])
          }}
          disabled={notifications.length === 0 && support.length === 0}
        >
          Marcar todas como lidas
        </button>
      </div>
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {supportError ? (
          <p role="alert" style={{ padding: 16 }}>
            {supportError}
          </p>
        ) : null}
        {!loading &&
          support.map((item) => (
            <button
              key={item.id}
              type="button"
              className="notification-item"
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
              }}
              onClick={async () => {
                await markSupport([item])
                const target =
                  role === 'DEV'
                    ? '/dev?view=support&'
                    : role === 'ADMIN'
                      ? '/admin?view=support&'
                      : '/suporte?'
                navigate(`${target}ticket=${item.ticketId}`)
                onClose()
              }}
            >
              <div className="notification-mark message" aria-hidden="true">
                <MessageSquare size={16} />
              </div>
              <div>
                <strong
                  style={{ fontSize: '.85rem', color: 'var(--text-main)' }}
                >
                  {item.title}
                </strong>
                <div
                  style={{
                    fontSize: '.7rem',
                    color: 'var(--text-muted)',
                    marginTop: 4,
                  }}
                >
                  {relativeTime(item.createdAt)}
                </div>
              </div>
            </button>
          ))}
        {loading ? (
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                className="skeleton skeleton-card"
                style={{ height: 48, borderRadius: 12 }}
              />
              <div
                className="skeleton skeleton-card"
                style={{ height: 48, borderRadius: 12 }}
              />
              <div
                className="skeleton skeleton-card"
                style={{ height: 48, borderRadius: 12 }}
              />
            </div>
          </div>
        ) : notifications.length === 0 && support.length === 0 ? (
          <div
            style={{
              padding: 20,
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
            }}
          >
            Nenhuma notificação recente.
          </div>
        ) : (
          notifications.map((notification) => {
            const tone = getTone(notification.type)
            return (
              <div key={notification.id} className="notification-item">
                <div className={`notification-mark ${tone}`} aria-hidden="true">
                  {getIcon(notification.type)}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'var(--text-main)',
                    }}
                  >
                    {notification.title}
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      marginTop: 2,
                    }}
                  >
                    {notification.desc}
                  </div>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      marginTop: 4,
                    }}
                  >
                    {relativeTime(notification.time)}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
