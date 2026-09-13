const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export type ZonedDateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
  minutesOfDay: number
  ymd: string
}

const pad2 = (value: number) => String(value).padStart(2, '0')

export function parseYmd(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (![year, month, day].every(Number.isInteger)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const check = new Date(Date.UTC(year, month - 1, day))
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

export function getZonedDateTimeParts(
  input: Date | string,
  timeZone = 'America/Sao_Paulo',
): ZonedDateTimeParts | null {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return null

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
    const parts = formatter.formatToParts(date)
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value

    const year = Number(get('year'))
    const month = Number(get('month'))
    const day = Number(get('day'))
    const hour = Number(get('hour'))
    const minute = Number(get('minute'))
    const second = Number(get('second'))
    const weekdayToken = get('weekday')
    const weekday = weekdayToken ? WEEKDAY_MAP[weekdayToken] : undefined

    if (
      ![year, month, day, hour, minute, second].every(Number.isFinite) ||
      weekday === undefined
    ) {
      return null
    }

    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      weekday,
      minutesOfDay: hour * 60 + minute,
      ymd: `${year}-${pad2(month)}-${pad2(day)}`,
    }
  } catch {
    return null
  }
}

export function zonedDateTimeToUtc(
  ymd: string,
  time: string,
  timeZone = 'America/Sao_Paulo',
): Date | null {
  const dateParts = parseYmd(ymd)
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time)
  if (!dateParts || !timeMatch) return null

  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  const second = Number(timeMatch[3] ?? 0)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return null
  }

  const target = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    hour,
    minute,
    second,
  )
  let candidate = new Date(target)

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const seen = getZonedDateTimeParts(candidate, timeZone)
    if (!seen) return null

    const seenAsUtc = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute,
      seen.second,
    )
    const difference = target - seenAsUtc
    if (difference === 0) break
    candidate = new Date(candidate.getTime() + difference)
  }

  const verified = getZonedDateTimeParts(candidate, timeZone)
  if (
    !verified ||
    verified.year !== dateParts.year ||
    verified.month !== dateParts.month ||
    verified.day !== dateParts.day ||
    verified.hour !== hour ||
    verified.minute !== minute ||
    verified.second !== second
  ) {
    return null
  }

  return candidate
}

export function ymdInTimeZone(input: Date | string, timeZone = 'America/Sao_Paulo') {
  return getZonedDateTimeParts(input, timeZone)?.ymd ?? ''
}

export function minutesInTimeZone(input: Date | string, timeZone = 'America/Sao_Paulo') {
  return getZonedDateTimeParts(input, timeZone)?.minutesOfDay ?? null
}

export function weekdayIndexForYmd(ymd: string, timeZone = 'America/Sao_Paulo') {
  const midday = zonedDateTimeToUtc(ymd, '12:00', timeZone)
  return midday ? getZonedDateTimeParts(midday, timeZone)?.weekday ?? null : null
}

export function formatTimeInZone(
  input: Date | string,
  timeZone = 'America/Sao_Paulo',
) {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date)
  } catch {
    return '—'
  }
}

export function formatDateInZone(
  input: Date | string,
  timeZone = 'America/Sao_Paulo',
) {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date)
  } catch {
    return '—'
  }
}

export function formatDateTimeInZone(
  input: Date | string,
  timeZone = 'America/Sao_Paulo',
) {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date)
  } catch {
    return '—'
  }
}

export function addDaysToYmd(ymd: string, amount: number) {
  const parsed = parseYmd(ymd)
  if (!parsed || !Number.isInteger(amount)) return null
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + amount, 12))
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

export function formatYmdPtBr(ymd: string) {
  const parsed = parseYmd(ymd)
  if (!parsed) return '—'
  return `${pad2(parsed.day)}/${pad2(parsed.month)}/${parsed.year}`
}

export function localDateToYmd(date: Date) {
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}
