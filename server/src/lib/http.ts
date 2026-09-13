// =============================================================================
// HTTP plumbing: structured logging, typed errors, and the error middleware.
// =============================================================================

import type { NextFunction, Request, Response } from 'express'

import { NotConfiguredError } from '@server/db/inventoryDb'

type Level = 'info' | 'warn' | 'error'

/** Emit one JSON log line, so container logs stay greppable. */
export function log(level: Level, message: string, context: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...context })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/** An error carrying the status code the client should see. */
export class HttpError extends Error {
  readonly status: number
  readonly details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = details
  }
}

export const badRequest = (message: string, details?: unknown): HttpError =>
  new HttpError(400, message, details)

export const unauthorized = (message: string): HttpError => new HttpError(401, message)

export const notFound = (message: string): HttpError => new HttpError(404, message)

/** สถานะของข้อมูลไม่ยอมให้ทำรายการนี้ (เช่น ใบที่อนุมัติแล้วแก้ไม่ได้) */
export const conflict = (message: string): HttpError => new HttpError(409, message)

/** Wrap an async handler so a rejected promise reaches the error middleware. */
export function asyncRoute(
  handler: (req: Request, res: Response) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next)
  }
}

/**
 * Terminal error handler.
 *
 * Known `HttpError`s surface their own message because it is written for the
 * operator to act on. Anything else is logged in full but reported generically,
 * so internal details never reach the browser.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์คลัง = ระบบยังให้บริการส่วนนี้ไม่ได้ (503) ไม่ใช่ bug (500)
  // ข้อความบอกทางแก้ไว้แล้วในตัว error จึงส่งต่อให้ผู้ใช้ได้ตรง ๆ
  if (error instanceof NotConfiguredError) {
    log('warn', 'request before configuration', { path: req.path })
    res.status(503).json({ error: error.message, code: 'NOT_CONFIGURED' })
    return
  }

  if (error instanceof HttpError) {
    log('warn', 'request rejected', {
      path: req.path,
      status: error.status,
      error: error.message,
    })
    res.status(error.status).json({ error: error.message, details: error.details })
    return
  }

  const message = error instanceof Error ? error.message : String(error)
  log('error', 'unhandled error', {
    path: req.path,
    error: message,
    stack: error instanceof Error ? error.stack : undefined,
  })
  res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ' })
}
