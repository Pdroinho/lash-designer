export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; code?: string } }

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    const message =
      (json && typeof json === 'object' && 'message' in json &&
        typeof json.message === 'string' &&
        json.message) ||
      `Erro HTTP ${res.status}`

    const code =
      json && typeof json === 'object' && 'code' in json &&
      typeof json.code === 'string'
        ? json.code
        : undefined

    return { ok: false, error: { message, code } }
  }

  return { ok: true, data: json as T }
}

