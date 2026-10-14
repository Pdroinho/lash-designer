import type Database from 'better-sqlite3'
import { z } from 'zod'
import { badRequest } from './http.js'
export const logoLayoutSchema = z.enum(['SYMBOL_NAME', 'FULL'])
export const logoSizeSchema = z.enum(['S', 'M', 'L'])
export const logoSuggestionSchema = z.object({layout: logoLayoutSchema, size: logoSizeSchema, rationale: z.string().max(220)}).strict()
export function brandColumns(db: Database.Database, alias = '') {
  const exists = (db.prepare('PRAGMA table_info(tenants)').all() as Array<{name:string}>).some(row => row.name === 'logo_layout')
  const prefix = alias ? `${alias}.` : ''
  return exists ? `, ${prefix}logo_layout as logoLayout, ${prefix}logo_size as logoSize, ${prefix}brand_background as backgroundColor, ${prefix}brand_secondary as secondaryColor` : ''
}
export function saveBrandPresentation(db: Database.Database, tenantId: string, layout?: 'SYMBOL_NAME' | 'FULL', size?: 'S' | 'M' | 'L', background?: string, secondary?: string) {
  if (layout === undefined && size === undefined && background === undefined && secondary === undefined) return
  if (!brandColumns(db)) throw badRequest('Atualize o banco para personalizar a marca.', 'MIGRATION_REQUIRED')
  db.prepare('UPDATE tenants SET logo_layout = COALESCE(?, logo_layout), logo_size = COALESCE(?, logo_size), brand_background = COALESCE(?, brand_background), brand_secondary = COALESCE(?, brand_secondary) WHERE id = ?').run(layout ?? null, size ?? null, background ?? null, secondary ?? null, tenantId)
}
