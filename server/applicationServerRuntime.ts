import type Database from 'better-sqlite3'
import type express from 'express'
import { createSecurityStateMaintenance } from './securityStateMaintenance.js'
import { createServerLifecycleRuntime } from './serverLifecycleRuntime.js'

type ManagedRuntime = { start: () => unknown; stop: () => unknown }

type ApplicationServerRuntimeOptions = {
  app: express.Express
  db: Database.Database
  nodeEnv: string
  port: number
  managedRuntimes: ManagedRuntime[]
  closeDatabase: () => void
}

export function createApplicationServerRuntime({
  app,
  db,
  nodeEnv,
  port,
  managedRuntimes,
  closeDatabase,
}: ApplicationServerRuntimeOptions) {
  const host = nodeEnv === 'production' ? '127.0.0.1' : '0.0.0.0'
  const securityStateMaintenance = createSecurityStateMaintenance({ db })
  return createServerLifecycleRuntime({
    listen: onListening => app.listen(port, host, onListening),
    listeningAddress: `${host}:${port}`,
    managedRuntimes,
    securityStateMaintenance,
    closeDatabase,
  })
}
