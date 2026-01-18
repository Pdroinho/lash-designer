import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { env } from './env.js'

let db: Database.Database | null = null

export function getDb() {
  if (db) return db
  const dbPath = path.resolve(env.DATABASE_PATH)
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
