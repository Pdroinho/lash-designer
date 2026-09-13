from pathlib import Path
from playwright.sync_api import sync_playwright
import base64, json, re, sys
root = Path(__file__).resolve().parents[1]
out = root / 'visual-output-landing-v58'
out.mkdir(exist_ok=True)
html=(root/'scripts/fixtures/landing-v58.html').read_text()
css=(root/'src/landing-v58.css').read_text()
html=re.sub(r'<link rel="stylesheet" href="../../src/landing-v58.css">', f'<style>{css}</style>', html)

def data_uri(path: Path):
    ext=path.suffix.lower()
    mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'}[ext]
    return f'data:{mime};base64,'+base64.b64encode(path.read_bytes()).decode()

for match in sorted(set(re.findall(r'src="(public/[^"]+)"', html))):
    html=html.replace(match, data_uri(root/match))
viewports=[(390,844),(768,900),(1440,900),(1920,1080)]
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for w,h in viewports:
        page=browser.new_page(viewport={'width':w,'height':h}, device_scale_factor=1)
        page.set_content(html, wait_until='load')
        page.screenshot(path=str(out/f'landing-{w}x{h}.png'), full_page=True)
        metrics=page.evaluate('''() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,heads:[...document.querySelectorAll('h1,h2,h3')].map(el=>{const s=getComputedStyle(el); return {sh:el.scrollHeight,ch:el.clientHeight,sw:el.scrollWidth,cw:el.clientWidth,ox:s.overflowX,oy:s.overflowY}})})''')
        overflow=metrics['sw']-metrics['cw']
        clipped=sum(1 for x in metrics['heads'] if ((x['ox'] in ('hidden','clip')) and x['sw']>x['cw']+2) or ((x['oy'] in ('hidden','clip')) and x['sh']>x['ch']+2))
        results.append({'viewport':f'{w}x{h}','overflow':overflow,'clippedHeadings':clipped})
        page.close()
    browser.close()
print(json.dumps(results,ensure_ascii=False,indent=2))
if any(r['overflow']>0 or r['clippedHeadings'] for r in results): sys.exit(1)
