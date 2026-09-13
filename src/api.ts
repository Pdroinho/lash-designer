export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; code?: string } }

const DEFAULT_TIMEOUT_MS = 20_000

export type ApiRequestInit = RequestInit & { timeoutMs?: number }

function requestHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers)
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData

  if (!headers.has('Content-Type') && !isFormData) {
    headers.set('Content-Type', 'application/json')
  }
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }

  return headers
}

export async function api<T>(path: string, init?: ApiRequestInit): Promise<ApiResult<T>> {
  const requestController = new AbortController()
  const externalSignal = init?.signal
  const abortFromExternal = () => requestController.abort(externalSignal?.reason)
  if (externalSignal?.aborted) abortFromExternal()
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true })

  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeout = window.setTimeout(() => requestController.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs)

  let res: Response
  try {
    const { timeoutMs: _timeoutMs, ...fetchInit } = init ?? {}
    res = await fetch(path, {
      ...fetchInit,
      signal: requestController.signal,
      headers: requestHeaders(fetchInit),
      credentials: 'include',
      cache: 'no-store',
    })
  } catch (error) {
    if (requestController.signal.aborted && !externalSignal?.aborted) {
      return { ok: false, error: { message: 'A solicitação demorou demais. Tente novamente.', code: 'REQUEST_TIMEOUT' } }
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: { message: 'A solicitação foi cancelada.', code: 'REQUEST_ABORTED' } }
    }
    return { ok: false, error: { message: 'Servidor indisponível', code: 'NETWORK_ERROR' } }
  } finally {
    window.clearTimeout(timeout)
    externalSignal?.removeEventListener('abort', abortFromExternal)
  }

  const json = res.status === 204 ? null : await res.json().catch(() => null)

  if (!res.ok) {
    const messageFromBody =
      json &&
      typeof json === 'object' &&
      'message' in json &&
      typeof json.message === 'string' &&
      json.message

    const message = messageFromBody || (res.status === 500 && json === null ? 'Servidor indisponível' : `Erro HTTP ${res.status}`)
    const code =
      json && typeof json === 'object' && 'code' in json && typeof json.code === 'string'
        ? json.code
        : undefined

    return { ok: false, error: { message, code } }
  }

  return { ok: true, data: json as T }
}
