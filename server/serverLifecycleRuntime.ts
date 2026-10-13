import type { Server } from 'node:http'

type ManagedRuntime = { start: () => unknown; stop: () => unknown }
type Signal = 'SIGTERM' | 'SIGINT'

type ServerLifecycleRuntimeOptions = {
  listen: (onListening: () => void) => Server
  listeningAddress: string
  managedRuntimes: ManagedRuntime[]
  securityStateMaintenance: ManagedRuntime
  closeDatabase: () => void
  registerSignal?: (signal: Signal, listener: () => void) => unknown
  scheduleForceShutdown?: typeof setTimeout
  clearForceShutdown?: typeof clearTimeout
  exit?: (code: number) => unknown
  log?: (message: string) => void
  logError?: (message: string) => void
}

export function createServerLifecycleRuntime({
  listen,
  listeningAddress,
  managedRuntimes,
  securityStateMaintenance,
  closeDatabase,
  registerSignal = (signal, listener) => process.on(signal, listener),
  scheduleForceShutdown = setTimeout,
  clearForceShutdown = clearTimeout,
  exit = code => process.exit(code),
  log = console.log,
  logError = console.error,
}: ServerLifecycleRuntimeOptions) {
  let server: Server | undefined
  let shuttingDown = false
  let finalized = false
  let forceShutdownTimer: ReturnType<typeof setTimeout> | undefined

  const finalize = (code: number) => {
    if (finalized) return
    finalized = true
    if (forceShutdownTimer) clearForceShutdown(forceShutdownTimer)
    closeDatabase()
    exit(code)
  }

  const shutdown = (signal: string) => {
    if (shuttingDown || !server) return false
    shuttingDown = true
    log(`[Shutdown] ${signal}`)
    for (const runtime of managedRuntimes) runtime.stop()
    securityStateMaintenance.stop()
    server.closeIdleConnections()
    forceShutdownTimer = scheduleForceShutdown(() => {
      logError('[Shutdown] encerramento forçado após timeout')
      server?.closeAllConnections()
      finalize(1)
    }, 10_000)
    forceShutdownTimer.unref()
    server.close(() => finalize(0))
    return true
  }

  const start = () => {
    if (server) return server
    server = listen(() => log(`server listening on ${listeningAddress}`))
    for (const runtime of managedRuntimes) runtime.start()
    securityStateMaintenance.start()
    registerSignal('SIGTERM', () => shutdown('SIGTERM'))
    registerSignal('SIGINT', () => shutdown('SIGINT'))
    return server
  }

  return { start, shutdown }
}
