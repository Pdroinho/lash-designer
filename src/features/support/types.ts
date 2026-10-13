export const statusLabels: Record<string, string> = {
  NEW: 'Novo',
  OPEN: 'Em atendimento',
  PENDING: 'Aguardando você',
  ON_HOLD: 'Aguardando análise',
  RESOLVED: 'Resolvido',
  CLOSED: 'Encerrado',
}
export const priorityLabels: Record<string, string> = {
  LOW: 'Baixo',
  NORMAL: 'Normal',
  HIGH: 'Alto',
  URGENT: 'Urgente',
}
export const categoryLabels: Record<string, string> = {
  ACCOUNT: 'Conta e acesso',
  BILLING: 'Assinatura e pagamento',
  WHATSAPP: 'WhatsApp',
  BOOKING: 'Agenda e agendamento',
  BUG: 'Problema na plataforma',
  FEATURE: 'Sugestão',
  OTHER: 'Outro assunto',
}
export type Attachment = {
  name: string
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  base64: string
}
export type SupportTicket = {
  id: number
  protocol: string
  subject: string
  category: string
  status: string
  priority: string
  version: number
  tenantName: string
  tenantSlug: string
  assignedTo: string | null
  createdAt: string
  updatedAt: string
  firstResponseAt: string | null
  overdue?: boolean
  unread?: number
}
export type SupportMessage = {
  id: string
  sequence: number
  body: string
  visibility: string
  kind: string
  authorRole: string
  authorName: string
  createdAt: string
  attachments: { id: string; name: string; size: number }[]
}
export type SupportDetail = {
  ticket: SupportTicket
  messages: SupportMessage[]
  nextAfter: number | null
}
export type SupportNotification = {
  id: string
  ticketId: number
  title: string
  createdAt: string
  readAt: string | null
}
