import { badRequest } from './http.js'

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

const pad2 = (value: number) => String(value).padStart(2, '0')

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
  timeZone: string,
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

export function utcForLocalTime(input: {
  timeZone: string
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second?: number
}) {
  const ymd = `${input.year}-${pad2(input.month)}-${pad2(input.day)}`
  const parsed = parseYmd(ymd)
  const second = input.second ?? 0
  if (
    !parsed ||
    input.hour < 0 ||
    input.hour > 23 ||
    input.minute < 0 ||
    input.minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    throw badRequest('Data inválida', 'INVALID_DATE')
  }

  const target = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    second,
  )
  let candidate = new Date(target)

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const seen = getZonedDateTimeParts(candidate, input.timeZone)
    if (!seen) throw badRequest('Fuso horário inválido', 'INVALID_TIMEZONE')
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

  const verified = getZonedDateTimeParts(candidate, input.timeZone)
  if (
    !verified ||
    verified.year !== input.year ||
    verified.month !== input.month ||
    verified.day !== input.day ||
    verified.hour !== input.hour ||
    verified.minute !== input.minute ||
    verified.second !== second
  ) {
    throw badRequest('Horário inválido para o fuso configurado', 'INVALID_LOCAL_TIME')
  }

  return candidate
}

export function dayBoundsUtc(input: { timeZone: string; ymd: string }) {
  const parsed = parseYmd(input.ymd)
  if (!parsed) throw badRequest('Data inválida', 'INVALID_DATE')

  const start = utcForLocalTime({
    timeZone: input.timeZone,
    year: parsed.year,
    month: parsed.month,
    day: parsed.day,
    hour: 0,
    minute: 0,
  })

  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1, 12))
  const endExclusive = utcForLocalTime({
    timeZone: input.timeZone,
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: 0,
    minute: 0,
  })

  return { start, endExclusive }
}

export function monthBoundsUtc(input: { timeZone: string; year: number; month: number }) {
  if (!Number.isInteger(input.year) || !Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    throw badRequest('Mês inválido', 'INVALID_MONTH')
  }

  const start = utcForLocalTime({
    timeZone: input.timeZone,
    year: input.year,
    month: input.month,
    day: 1,
    hour: 0,
    minute: 0,
  })

  const nextMonth = new Date(Date.UTC(input.year, input.month, 15, 12))
  const endExclusive = utcForLocalTime({
    timeZone: input.timeZone,
    year: nextMonth.getUTCFullYear(),
    month: nextMonth.getUTCMonth() + 1,
    day: 1,
    hour: 0,
    minute: 0,
  })

  return { start, endExclusive }
}

export function shiftYearMonth(input: { year: number; month: number }, offset: number) {
  if (!Number.isInteger(offset)) throw badRequest('Deslocamento de mês inválido', 'INVALID_MONTH_OFFSET')
  const date = new Date(Date.UTC(input.year, input.month - 1 + offset, 15, 12))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }
}
