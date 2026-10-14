import { useState } from 'react'
import type { TenantPublic } from '../types'
export type BrandPresentation = Pick<TenantPublic, 'name' | 'logoUrl' | 'logoLayout' | 'logoSize'>
export function TenantBrand({brand, className = '', defaultLogo = '/brand/logo-symbol.png'}: {brand?: BrandPresentation | null; className?: string; defaultLogo?: string}) {
  const [failed, setFailed] = useState<string | null>(null)
  const name = brand?.name || 'Lash Designer'
  const logo = brand?.logoUrl && failed !== brand.logoUrl ? brand.logoUrl : null
  const full = Boolean(logo && brand?.logoLayout === 'FULL')
  return <span className={`tenant-brand ${className}`} data-layout={full ? 'FULL' : 'SYMBOL_NAME'} data-size={brand?.logoSize || 'M'}>
    <img className="tenant-brand-image" src={logo || defaultLogo} alt={full ? name : ''} decoding="async" onError={() => {if (logo) setFailed(logo)}} />
    {!full ? <span className="tenant-brand-name">{name}</span> : null}
  </span>
}
