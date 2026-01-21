import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { env } from './env.js'

let db: Database.Database | null = null

function openDb(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const d = new Database(dbPath)
  d.pragma('journal_mode = WAL')
  d.pragma('foreign_keys = ON')
  return d
}

export function getDb() {
  if (db) return db
  const primaryPath = path.resolve(env.DATABASE_PATH)
  try {
    db = openDb(primaryPath)
    return db
  } catch (err) {
    const fallbackPath = path.resolve('./data/app.db')
    if (fallbackPath === primaryPath) throw err
    db = openDb(fallbackPath)
    return db
  }
}
