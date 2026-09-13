from pathlib import Path
import re, json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
fixture=(ROOT/'visual-fixtures/app.html').read_text()
css_order=['styles.css','responsive.css','design-system.css','setup.css','foundation-v24.css','shell-v24.css','overlays-v24.css','tour-v24.css','forms-v24.css','services-v24.css','agenda-v24.css','dashboard-v24.css','finance-v24.css','billing-v24.css','luma-v32.css','whatsapp-v24.css','auth-v24.css','landing.css','landing-v24.css']
styles='\n'.join((ROOT/'src'/f).read_text() for f in css_order if (ROOT/'src'/f).exists())
html=re.sub(r'<link rel="stylesheet"[^>]+>','',fixture).replace('</head>',f'<style>{styles}</style></head>')
rows=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':1024,'height':768})
 for zoom in (1,1.25,1.5):
  w=round(1024/zoom); h=max(420,round(768/zoom))
  page.set_viewport_size({'width':w,'height':h})
  content=html.replace("const q=new URLSearchParams(location.search), screen=q.get('screen')||'dashboard', collapsed=q.get('collapsed')==='1';", "const q=new URLSearchParams('screen=dashboard&collapsed=0'), screen=q.get('screen')||'dashboard', collapsed=q.get('collapsed')==='1';")
  page.set_content(content,wait_until='domcontentloaded'); page.wait_for_timeout(420)
  before=page.locator('.ld-main').bounding_box()
  page.evaluate("""() => { document.body.classList.add('has-blocking-overlay'); document.body.style.setProperty('--ld-scroll-lock-gap', `${window.innerWidth-document.documentElement.clientWidth}px`); const o=document.createElement('div'); o.className='ld-overlay'; o.id='qa-overlay-shift'; o.innerHTML='<div class="ld-dialog" style="height:260px"></div>'; document.body.append(o); }""")
  page.wait_for_timeout(50)
  after=page.locator('.ld-main').bounding_box(); ov=page.locator('#qa-overlay-shift').bounding_box()
  shift=max(abs(before['x']-after['x']),abs(before['width']-after['width']))
  cover=abs(ov['x'])<1 and abs(ov['y'])<1 and abs(ov['width']-w)<2 and abs(ov['height']-h)<2
  rows.append({'zoom':zoom,'cssViewport':f'{w}x{h}','maxShellShiftPx':round(shift,3),'overlayCoversViewport':cover})
  page.evaluate("""() => { document.getElementById('qa-overlay-shift')?.remove(); document.body.classList.remove('has-blocking-overlay'); document.body.style.removeProperty('--ld-scroll-lock-gap') }""")
 b.close()
fail=[r for r in rows if r['maxShellShiftPx']>0.5 or not r['overlayCoversViewport']]
(ROOT/'visual-output'/'overlay-shift-final.json').write_text(json.dumps(rows,indent=2))
print(json.dumps({'cases':rows,'failures':len(fail)},indent=2))
raise SystemExit(bool(fail))
