
const utcForLocalTime = (input: {
  timeZone: string
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second?: number
}) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: input.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const targetUtc = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second ?? 0)
  let utc = new Date(targetUtc)

  for (let i = 0; i < 4; i++) {
    const parts = fmt.formatToParts(utc)
    const get = (type: string) => parts.find((p) => p.type === type)?.value
    const y = Number(get('year'))
    const m = Number(get('month'))
    const d = Number(get('day'))
    const hh = Number(get('hour'))
    const mm = Number(get('minute'))
    const ss = Number(get('second'))
    
    // console.log(`Attempt ${i}: Input UTC=${utc.toISOString()} -> Local in ${input.timeZone}=${y}-${m}-${d} ${hh}:${mm}:${ss}`)
    
    if (![y, m, d, hh, mm, ss].every(Number.isFinite)) break

    const seenUtc = Date.UTC(y, m - 1, d, hh, mm, ss)
    const diff = targetUtc - seenUtc
    if (diff === 0) break
    utc = new Date(utc.getTime() + diff)
  }
  return utc
}

const parseYmd = (ymd: string) => {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(ymd)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  return { year, month, day }
}

const weekdayIndexForDate = (ymd: string, timeZone: string) => {
  const p = parseYmd(ymd)
  if (!p) return null
  const dt = utcForLocalTime({ timeZone, year: p.year, month: p.month, day: p.day, hour: 12, minute: 0, second: 0 })
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
  const token = fmt.format(dt)
  console.log(`Date: ${ymd}, TZ: ${timeZone}, UTC Date: ${dt.toISOString()}, Day Token: ${token}`)
  const idx = weekdayMap[token]
  return typeof idx === 'number' ? idx : null
}

console.log('Testing 2026-01-23 (Friday):')
console.log('Index:', weekdayIndexForDate('2026-01-23', 'America/Sao_Paulo'))

console.log('\nTesting 2026-01-24 (Saturday):')
console.log('Index:', weekdayIndexForDate('2026-01-24', 'America/Sao_Paulo'))
