const OFFICIAL_ANNUAL_PRICE_CENTS = 59880

export function subscriptionPriceCents() {
  return OFFICIAL_ANNUAL_PRICE_CENTS
}

export function currencyBRLFromCents(cents: number, options?: Intl.NumberFormatOptions) {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
    ...options,
  })
}
