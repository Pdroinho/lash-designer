import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import type { SessionUser } from '../../types'
import { Shell } from '../../layouts/Shell'
import { SidebarItem } from '../../components/SharedUi'
import { Calendar, MessageSquare, LogOut } from '../../components/Icons'
import { SupportCenter } from './SupportCenter'
export function SupportWorkspace() {
  const navigate = useNavigate(),
    [user, setUser] = useState<SessionUser | null>(null)
  useEffect(() => {
    void api<{ user: SessionUser | null }>('/api/auth/me').then((res) => {
      if (!res.ok || !res.data.user) {
        navigate('/login', { replace: true })
        return
      }
      if (res.data.user.role !== 'STAFF') {
        navigate('/', { replace: true })
        return
      }
      setUser(res.data.user)
    })
  }, [navigate])
  if (!user) return <p role="status">Carregando suporte…</p>
  return (
    <Shell
      title="Suporte"
      subtitle="Seu estúdio"
      user={user}
      sidebar={
        <>
          <SidebarItem
            icon={<Calendar size={18} />}
            label="Minha agenda"
            onClick={() => navigate('/equipe')}
          />
          <SidebarItem
            active
            icon={<MessageSquare size={18} />}
            label="Suporte"
            onClick={() => navigate('/suporte')}
          />
          <SidebarItem
            icon={<LogOut size={18} />}
            label="Sair"
            onClick={async () => {
              await api('/api/auth/logout', { method: 'POST' })
              window.location.assign('/login')
            }}
          />
        </>
      }
    >
      <SupportCenter role="STAFF" />
    </Shell>
  )
}
