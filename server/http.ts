import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

export class HttpError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function badRequest(message: string, code?: string) {
  return new HttpError(400, message, code)
}

export function unauthorized(message = 'Não autorizado', code?: string) {
  return new HttpError(401, message, code)
}

export function forbidden(message = 'Proibido', code?: string) {
  return new HttpError(403, message, code)
}

export function notFound(message = 'Não encontrado', code?: string) {
  return new HttpError(404, message, code)
}

export function handleError(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message, code: err.code })
    return
  }

  if (err instanceof z.ZodError) {
    res.status(400).json({ message: 'Dados inválidos', code: 'VALIDATION_ERROR' })
    return
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(err)
  }

  res.status(500).json({ message: 'Erro interno', code: 'INTERNAL_ERROR' })
}
