export function campaignMessageWithOptOut(text: string) {
  const clean = text.trim().replace(/\n{3,}/g, '\n\n')
  if (/\bresponda\s+(sair|pare|parar|stop)\b/i.test(clean)) return clean
  return `${clean}\n\nPara não receber mais novidades e ofertas, responda SAIR.`
}

export function renderMarketingCampaignMessage(template: string, input: { clientName: string; tenantName: string }) {
  return template
    .replaceAll('{{nome}}', input.clientName)
    .replaceAll('{{espaco}}', input.tenantName)
    .replace(/\s+\n/g, '\n')
    .trim()
}
