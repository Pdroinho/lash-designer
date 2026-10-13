import { readFileSync } from 'node:fs'
import path from 'node:path'

type FatalEvent = 'uncaughtException' | 'unhandledRejection'

type ProcessFoundationOptions = {
  nodeEnv: string
  port: number
  manifestPath?: string
  readManifest?: (manifestPath: string) => string
  registerFatalHandler?: (event: FatalEvent, listener: (error: unknown) => void) => unknown
  exit?: (code: number) => unknown
  log?: (message: string) => void
  logError?: (message: string, error: unknown) => void
}

export function readApplicationVersion(
  manifestPath = path.resolve(process.cwd(), 'package.json'),
  readManifest: (manifestPath: string) => string = pathToManifest => readFileSync(pathToManifest, 'utf8'),
) {
  try {
    const manifest = JSON.parse(readManifest(manifestPath)) as { version?: unknown }
    return typeof manifest.version === 'string' && manifest.version.trim()
      ? manifest.version.trim()
      : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function initializeProcessFoundation({
  nodeEnv,
  port,
  manifestPath,
  readManifest,
  registerFatalHandler = (event, listener) => process.on(event, listener),
  exit = code => process.exit(code),
  log = console.log,
  logError = console.error,
}: ProcessFoundationOptions) {
  registerFatalHandler('uncaughtException', error => {
    logError('[Fatal] uncaughtException', error)
    exit(1)
  })
  registerFatalHandler('unhandledRejection', error => {
    logError('[Fatal] unhandledRejection', error)
    exit(1)
  })

  log(`[Startup] NODE_ENV: ${nodeEnv}`)
  log(`[Startup] PORT: ${port}`)
  log('[Startup] Database configured')

  return { appVersion: readApplicationVersion(manifestPath, readManifest) }
}
