import assert from 'node:assert/strict'
import test from 'node:test'
import { renderClientIndexHtml } from './seo.js'

const template = '<head><meta name="robots" content="noindex,nofollow" /></head>'

test('indexa somente a raiz do domínio principal', () => {
  const html = renderClientIndexHtml({
    template,
    requestHost: 'app.exemplo.com.br',
    requestPath: '/',
    platformHostname: 'app.exemplo.com.br',
    canonicalBaseUrl: 'https://app.exemplo.com.br/',
  })
  assert.match(html, /index,follow/)
  assert.match(html, /rel="canonical" href="https:\/\/app\.exemplo\.com\.br"/)
  assert.match(html, /property="og:url"/)
})

test('aceita www somente como variação normalizada do domínio principal', () => {
  const html = renderClientIndexHtml({
    template,
    requestHost: 'www.exemplo.com.br',
    requestPath: '/',
    platformHostname: 'exemplo.com.br',
    canonicalBaseUrl: 'https://exemplo.com.br',
  })
  assert.match(html, /index,follow/)
})

test('mantém noindex em login, painéis e hosts de tenant', () => {
  for (const [requestHost, requestPath] of [
    ['app.exemplo.com.br', '/login'],
    ['app.exemplo.com.br', '/admin'],
    ['studio.app.exemplo.com.br', '/'],
    ['studio.app.exemplo.com.br', '/agendar'],
  ]) {
    const html = renderClientIndexHtml({
      template,
      requestHost,
      requestPath,
      platformHostname: 'app.exemplo.com.br',
      canonicalBaseUrl: 'https://app.exemplo.com.br',
    })
    assert.equal(html, template)
  }
})
