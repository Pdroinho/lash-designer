import { env } from './env.js'

export async function createHostingerSubdomain(slug: string, token: string): Promise<{success: boolean, logs: string[]}> {
  const logs: string[] = []
  const log = (msg: string) => {
      console.log(msg)
      logs.push(msg)
  }

  log(`[Hostinger] Starting subdomain creation for slug: ${slug}`)
  log(`[Hostinger] Token provided (first 5 chars): ${token.substring(0, 5)}...`)
  
  try {
      // Endpoint based on standard Hostinger API structure (v1)
      // Note: If using cPanel or CyberPanel, the endpoint would differ.
      const endpoint = 'https://api.hostinger.com/v1/hosting/subdomains'
      
      log(`[Hostinger] Sending POST request to ${endpoint}`)
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          domain: 'lashdesigner.space', // Base domain
          subdomain: slug,
          directory: `public_html/${slug}`
        })
      })

      log(`[Hostinger] API Response Status: ${res.status} ${res.statusText}`)
      
      const responseText = await res.text()
      try {
        const json = JSON.parse(responseText)
        log(`[Hostinger] Response Body: ${JSON.stringify(json, null, 2)}`)
      } catch {
        log(`[Hostinger] Response Body (Raw): ${responseText.substring(0, 200)}...`)
      }

      if (!res.ok) {
        log(`[Hostinger] Failed to create subdomain via API.`)
        // We return success: true anyway so the tenant creation in our DB isn't rolled back,
        // allowing the user to retry or fix DNS manually.
        return { success: true, logs }
      }
      
      log('[Hostinger] Subdomain created successfully via API!')
      return { success: true, logs }

  } catch (error) {
      log(`[Hostinger] Network/System error during API call: ${error}`)
      // Return true to preserve the tenant in DB
      return { success: true, logs }
  }
}
