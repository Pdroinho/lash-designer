export type Hours = { weekday: number; startMinute: number; endMinute: number }
export type Professional = {
  id: string
  name: string
  photoUrl?: string | null
  instagram?: string | null
  tiktok?: string | null
  active: boolean
  bookable: boolean
  userId: string | null
  accessRole: string | null
  accessPhone?: string | null
  accessDisabledAt: string | null
  pendingInvitation: { phone?: string; email: string; expiresAt: string } | null
  serviceIds: string[]
  hours: Hours[]
}
export type TeamData = {
  professionals: Professional[]
  seatLimit: number
  businessHours: Hours[]
  timezone: string
}
export const weekdays = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
]
export const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
export function hoursError(rows: Hours[]) {
  if (!rows.length) return 'Escolha pelo menos um dia de atendimento.'
  const sorted = [...rows].sort(
    (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
  )
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]
    if (row.startMinute >= row.endMinute)
      return `Em ${weekdays[row.weekday].toLowerCase()}, o fim precisa ser depois do início.`
    if (
      i &&
      sorted[i - 1].weekday === row.weekday &&
      sorted[i - 1].endMinute > row.startMinute
    )
      return `Os horários de ${weekdays[row.weekday].toLowerCase()} estão sobrepostos.`
  }
  return ''
}
