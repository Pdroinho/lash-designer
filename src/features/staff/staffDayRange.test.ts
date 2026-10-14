import assert from 'node:assert/strict'
import test from 'node:test'
import { staffDayRange } from './staffDayRange.js'

test('agenda accepts leap days and rejects cleared, partial and impossible dates', () => {
  for (const value of ['', '2026-', '2026-02-30', '2025-02-29', '2026-13-01', 'invalid']) {
    assert.equal(staffDayRange(value), null)
  }
  assert.ok(staffDayRange('2028-02-29'))
})

test('agenda follows local calendar days across daylight saving changes', () => {
  const previous = process.env.TZ
  try {
    process.env.TZ = 'America/New_York'
    const spring = staffDayRange('2026-03-08')!
    const autumn = staffDayRange('2026-11-01')!
    assert.equal(Date.parse(spring.end) - Date.parse(spring.start), 23 * 3600_000)
    assert.equal(Date.parse(autumn.end) - Date.parse(autumn.start), 25 * 3600_000)
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})


test('studio timezone defines the selected day independently of browser timezone',()=>{
 assert.deepEqual(staffDayRange('2026-10-13','America/Manaus'),{start:'2026-10-13T04:00:00.000Z',end:'2026-10-14T04:00:00.000Z'})
 assert.deepEqual(staffDayRange('2026-10-13','Asia/Tokyo'),{start:'2026-10-12T15:00:00.000Z',end:'2026-10-13T15:00:00.000Z'})
 assert.equal(staffDayRange('2026-02-30','America/Manaus'),null)
 assert.equal(staffDayRange('2026-10-13','Invalid/Timezone'),null)
})
test('explicit studio timezone preserves daylight-saving day lengths',()=>{
 const spring=staffDayRange('2026-03-08','America/New_York')!,fall=staffDayRange('2026-11-01','America/New_York')!
 assert.equal(Date.parse(spring.end)-Date.parse(spring.start),23*3600000)
 assert.equal(Date.parse(fall.end)-Date.parse(fall.start),25*3600000)
})
