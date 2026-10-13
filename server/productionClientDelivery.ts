import express from 'express'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderClientIndexHtml } from './seo.js'

type ProductionClientDeliveryOptions = {
  nodeEnv: string
  platformHostname: string | null
  canonicalBaseUrl?: string
  clientDir?: string
  readTemplate?: (indexPath: string) => string
}

export function configureProductionClientDelivery(
  app: express.Express,
  {
    nodeEnv,
    platformHostname,
    canonicalBaseUrl,
    clientDir = path.resolve('dist/client'),
    readTemplate = indexPath => readFileSync(indexPath, 'utf8'),
  }: ProductionClientDeliveryOptions,
) {
  if (nodeEnv !== 'production') return false

  const clientIndexTemplate = readTemplate(path.join(clientDir, 'index.html'))
  app.use(express.static(clientDir, { index: false }))
  app.get(/^(?!\/api).*$/, (req, res) => {
    const html = renderClientIndexHtml({
      template: clientIndexTemplate,
      requestHost: req.hostname,
      requestPath: req.path,
      platformHostname,
      canonicalBaseUrl,
    })

    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Vary', 'Host')
    res.type('html').send(html)
  })
  return true
}
