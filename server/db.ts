import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { env } from './env.js'

let db: Database.Database | null = null

function openDb(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const database = new Database(dbPath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  database.pragma(`synchronous = ${env.NODE_ENV === 'production' ? 'FULL' : 'NORMAL'}`)
  return database
}

export function getDb() {
  if (db) return db
  const databasePath = path.resolve(env.DATABASE_PATH)
  db = openDb(databasePath)
  return db
}

export function closeDb() {
  if (!db) return
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    db.close()
    db = null
  }
}
