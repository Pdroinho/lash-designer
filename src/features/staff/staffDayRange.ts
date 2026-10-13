export function staffDayRange(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const start = new Date(`${day}T00:00:00`)
  if (!Number.isFinite(start.getTime())) return null
  const actual = `${String(start.getFullYear()).padStart(4, '0')}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  if (actual !== day) return null
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}
