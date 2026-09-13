from __future__ import annotations
from pathlib import Path
import base64, json, re, os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'visual-output'
OUT.mkdir(exist_ok=True)
FILTER={x for x in os.environ.get('VISUAL_SCREENS','').split(',') if x}
CLEAN_SHOTS=os.environ.get('CLEAN_SHOTS')=='1'
if not FILTER:
    for old in OUT.glob('*.png'): old.unlink()
FIXTURE = (ROOT / 'visual-fixtures' / 'app.html').read_text()

CSS_ORDER = ['styles.css','responsive.css','design-system.css','product-system-v33.css','product-controls-v40.css','setup.css','foundation-v24.css','shell-v24.css','overlays-v24.css','tour-v24.css','forms-v24.css','services-v24.css','agenda-v24.css','dashboard-v24.css','finance-v24.css','finance-v36.css','billing-v24.css','luma-v32.css','luma-v35.css','whatsapp-v24.css','whatsapp-v39.css','auth-v24.css','landing.css','landing-v24.css']
styles = '\n'.join((ROOT/'src'/name).read_text() for name in CSS_ORDER if (ROOT/'src'/name).exists())
html = re.sub(r'<link rel="stylesheet"[^>]+>', '', FIXTURE)
html = html.replace('</head>', f'<style>{styles}</style></head>')

def data_uri(rel: str) -> str:
    p = ROOT / rel
    if not p.exists(): return ''
    ext=p.suffix.lower(); mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'}.get(ext,'application/octet-stream')
    return f'data:{mime};base64,'+base64.b64encode(p.read_bytes()).decode()

for raw, rel in {
    '../public/brand/logo-symbol.png':'public/brand/logo-symbol.png',
    '../public/brand/logo-symbol-light.png':'public/brand/logo-symbol-light.png',
    '../public/dashboard/human-studio.webp':'public/dashboard/human-studio.webp',
    '../public/landing/product/dashboard.webp':'public/landing/product/dashboard.webp',
    '../public/services/service-classico.webp':'public/services/service-classico.webp',
    '../public/services/service-volume-brasileiro.webp':'public/services/service-volume-brasileiro.webp',
    '../public/services/service-manutencao.webp':'public/services/service-manutencao.webp',
}.items(): html=html.replace(raw, data_uri(rel))

CASES = [
  ('dashboard',320,568,False,1.0), ('dashboard',360,800,False,1.0), ('dashboard',390,844,False,1.0), ('dashboard',412,915,False,1.0),
  ('dashboard',768,900,False,1.0), ('dashboard',1024,768,False,1.0), ('dashboard',1280,720,False,1.0), ('dashboard',1366,900,False,1.0), ('dashboard',1920,1080,False,1.0),
  ('dashboard',1024,620,True,1.0), ('dashboard',1366,768,True,1.0),
  ('agenda',320,568,False,1.0), ('agenda',375,667,False,1.0), ('agenda',390,844,False,1.0), ('agenda',768,900,False,1.0), ('agenda',1366,900,False,1.0),
  ('agenda-month',320,568,False,1.0), ('agenda-month',390,844,False,1.0), ('agenda-month',1024,768,False,1.0),
  ('agenda-hours',320,568,False,1.0), ('agenda-hours',390,844,False,1.0), ('agenda-hours',1024,768,False,1.0),
  ('agenda-blocks',320,568,False,1.0), ('agenda-blocks',390,844,False,1.0), ('agenda-blocks',1024,768,False,1.0),
  ('modal',320,568,False,1.0), ('modal',375,667,False,1.0), ('modal',1024,768,False,1.0), ('modal',1440,900,False,1.0),
  ('modal-long',320,568,False,1.0), ('modal-long',390,844,False,1.0), ('modal-long',1024,720,False,1.0),
  ('tour',320,568,False,1.0), ('tour',375,667,False,1.0), ('tour',1024,768,False,1.0),
  ('settings',320,568,False,1.0), ('settings',360,800,False,1.0), ('settings',1024,768,False,1.0),
  ('services',320,568,False,1.0), ('services',390,844,False,1.0), ('services',1024,768,False,1.0),
  ('billing',320,568,False,1.0), ('billing',390,844,False,1.0), ('billing',1024,768,False,1.0), ('billing',1366,900,False,1.0),
  ('whatsapp',320,568,False,1.0), ('whatsapp',390,844,False,1.0), ('whatsapp',1024,768,False,1.0),
  ('finance',320,568,False,1.0), ('finance',390,844,False,1.0), ('finance',1024,768,False,1.0),
  ('drawer',320,568,False,1.0), ('drawer',390,844,False,1.0),
  ('dev-dark',1024,620,False,1.0), ('dev-dark',1366,768,False,1.0),
  ('setup',320,568,False,1.0), ('setup',390,844,False,1.0), ('setup',1024,768,False,1.0),
  ('luma-empty',320,568,False,1.0), ('luma-empty',390,844,False,1.0), ('luma-empty',1024,768,False,1.0),
  ('luma',320,568,False,1.0), ('luma',390,844,False,1.0), ('luma',1024,768,False,1.0),
  ('luma-drawer',320,568,False,1.0), ('luma-drawer',390,844,False,1.0), ('luma-drawer',995,907,False,1.0), ('luma-drawer',1024,768,False,1.0), ('luma-drawer',1440,900,False,1.0),
  ('luma-drawer-thread',320,568,False,1.0), ('luma-drawer-thread',390,844,False,1.0), ('luma-drawer-thread',1024,768,False,1.0),
  ('auth',320,568,False,1.0), ('auth',390,844,False,1.0), ('auth',1024,768,False,1.0),
  ('booking',320,568,False,1.0), ('booking',390,844,False,1.0), ('booking',1024,768,False,1.0),
  ('client',320,568,False,1.0), ('client',390,844,False,1.0), ('client',1024,768,False,1.0),
  ('checkout',320,568,False,1.0), ('checkout',390,844,False,1.0), ('checkout',1024,768,False,1.0), ('checkout',1366,900,False,1.0),
  ('landing',320,568,False,1.0), ('landing',390,844,False,1.0), ('landing',768,900,False,1.0), ('landing',1366,900,False,1.0), ('landing',1440,900,False,1.0), ('landing',1920,1080,False,1.0),
]
# Browser zoom is modeled as the resulting CSS viewport pressure: physical viewport / zoom.
for z in (0.8,0.9,1.1,1.25,1.5):
    CASES += [('modal',1024,768,False,z),('agenda',1366,900,False,z),('landing',1366,900,False,z),('luma',1024,768,False,z),('luma-drawer',1024,768,False,z),('luma-drawer-thread',1024,768,False,z)]

if FILTER:
    CASES=[case for case in CASES if case[0] in FILTER]
results=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':1024,'height':768})
    page=context.new_page()
    for screen,physical_w,physical_h,collapsed,zoom in CASES:
        css_w=max(280,round(physical_w/zoom)); css_h=max(420,round(physical_h/zoom))
        page.set_viewport_size({'width':css_w,'height':css_h})
        content=html.replace("const q=new URLSearchParams(location.search), screen=q.get('screen')||'dashboard', collapsed=q.get('collapsed')==='1';", f"const q=new URLSearchParams('screen={screen}&collapsed={1 if collapsed else 0}'), screen=q.get('screen')||'dashboard', collapsed=q.get('collapsed')==='1';")
        page.set_content(content, wait_until='domcontentloaded')
        page.wait_for_function("document.body && document.body.dataset.qa", timeout=1500)
        page.wait_for_timeout(380)
        qa=json.loads(page.locator('#qa').inner_text())
        html_ok=qa['html'][1] <= qa['html'][0] + 1
        body_ok=qa['body'][1] <= qa['body'][0] + 1
        page_ok=(qa.get('page') is None) or qa['page'][1] <= qa['page'][0] + 1
        overlay_ok=True
        if qa.get('overlay'):
            r=qa['overlay']; overlay_ok=abs(r['x'])<1.1 and abs(r['y'])<1.1 and abs(r['width']-css_w)<2.1 and abs(r['height']-css_h)<2.1
        if qa.get('tour'):
            r=qa['tour']; overlay_ok=overlay_ok and abs(r['x'])<1.1 and abs(r['y'])<1.1 and abs(r['width']-css_w)<2.1 and abs(r['height']-css_h)<2.1
        dialog_ok=True
        r=qa.get('dialog') or qa.get('tourCard')
        if r:
            dialog_ok=r['left'] >= -1 and r['right'] <= css_w+1 and r['top'] >= -1 and r['bottom'] <= css_h+1
        text_issues=page.evaluate("""() => Array.from(document.querySelectorAll('h1,h2,h3,h4,p,label,strong,span,a,button')).filter(el => { const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0) return false; const text=(el.textContent||'').trim().replace(/\\s+/g,' '); if(text.length<6) return false; const r=el.getBoundingClientRect(); const fs=parseFloat(cs.fontSize)||16; return r.width>0 && r.width<30 && r.height>fs*2.2; }).slice(0,10).map(el=>({text:(el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,80),width:Math.round(el.getBoundingClientRect().width),height:Math.round(el.getBoundingClientRect().height),className:typeof el.className==='string'?el.className:''}))""")
        sidebar_ok=True
        if qa.get('sidebar') and collapsed and css_w>900:
            r=qa['sidebar']; sidebar_ok=r['width'] <= 90
        result={'screen':screen,'physicalViewport':f'{physical_w}x{physical_h}','effectiveCssViewport':f'{css_w}x{css_h}','collapsed':collapsed,'zoom':zoom,'htmlOverflow':not html_ok,'bodyOverflow':not body_ok,'pageOverflow':not page_ok,'overlayViewport':overlay_ok,'dialogContained':dialog_ok,'sidebarCollapsed':sidebar_ok,'suspiciousText':text_issues}
        results.append(result)
        failure=not (html_ok and body_ok and page_ok and overlay_ok and dialog_ok and sidebar_ok and not text_issues)
        representative = zoom==1 and (((physical_w,physical_h) in [(320,568),(375,667),(390,844),(768,900),(1024,768),(1366,900),(1920,1080)]) or collapsed or screen=='dev-dark')
        if representative or failure:
            if CLEAN_SHOTS:
                page.locator('#qa').evaluate("el => el.style.display='none'")
            filename=f'{screen}-{physical_w}x{physical_h}-c{int(collapsed)}-z{str(zoom).replace(".","_")}.png'
            page.screenshot(path=str(OUT/filename), full_page=False)
            result['screenshot']=filename
    page.close(); context.close(); browser.close()

matrix_name='matrix-'+('-'.join(sorted(FILTER)))+'.json' if FILTER else 'matrix.json'
(ROOT/'visual-output'/matrix_name).write_text(json.dumps(results,ensure_ascii=False,indent=2))
fail=[r for r in results if r['htmlOverflow'] or r['bodyOverflow'] or r['pageOverflow'] or not r['overlayViewport'] or not r['dialogContained'] or not r['sidebarCollapsed'] or r.get('suspiciousText')]
print(json.dumps({'cases':len(results),'failures':len(fail),'failureDetails':fail},ensure_ascii=False,indent=2))
