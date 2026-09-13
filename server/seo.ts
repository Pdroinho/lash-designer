type RenderClientIndexOptions = {
  template: string
  requestHost: string
  requestPath: string
  platformHostname: string | null
  canonicalBaseUrl?: string
}

const normalizeHost = (value: string | null | undefined) =>
  String(value ?? '').trim().toLowerCase().replace(/^www\./, '')

const escapeHtmlAttribute = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

export function renderClientIndexHtml(options: RenderClientIndexOptions) {
  const requestHost = normalizeHost(options.requestHost)
  const platformHost = normalizeHost(options.platformHostname)
  const isMarketingLanding = Boolean(
    platformHost
      && requestHost === platformHost
      && options.requestPath === '/',
  )

  if (!isMarketingLanding) return options.template

  let html = options.template.replace(
    '<meta name="robots" content="noindex,nofollow" />',
    '<meta name="robots" content="index,follow" />',
  )

  const canonical = String(options.canonicalBaseUrl ?? '').trim().replace(/\/$/, '')
  if (canonical) {
    const escaped = escapeHtmlAttribute(canonical)
    html = html.replace(
      '</head>',
      `    <link rel="canonical" href="${escaped}" />\n    <meta property="og:url" content="${escaped}" />\n  </head>`,
    )
  }

  return html
}
