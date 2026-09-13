from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageOps, ImageDraw
import json, math

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'visual-output-v40-consistency'
OUT.mkdir(exist_ok=True)
css_files = [
    'styles.css','responsive.css','design-system.css','product-system-v33.css','product-controls-v40.css',
    'foundation-v24.css','overlays-v24.css','finance-v36.css','whatsapp-v39.css','setup.css'
]
css = '\n'.join((ROOT/'src'/f).read_text() for f in css_files)

select_trigger = lambda value, compact=False: f'''<button type="button" class="ld-select-trigger {'ld-select-trigger--compact' if compact else 'ld-select-trigger--default'}"><span class="ld-select-value"><span>{value}</span></span><span class="ld-select-chevron">⌄</span></button>'''

def chart_screen():
    return f'''<section class="finance36" style="max-width:1120px;margin:0 auto"><article class="finance36-panel"><header class="finance36-panel-head"><div><span class="finance36-panel-kicker">Últimos 6 meses</span><h3>Entradas x saídas</h3></div><div class="finance36-legend"><span><i></i>Entradas</span><span><i class="is-expense"></i>Saídas</span><span><i class="is-balance"></i>Saldo</span></div></header><div class="finance40-chart-shell"><div class="finance40-chart-canvas"><canvas id="qa-chart"></canvas></div><div class="finance40-chart-caption"><span>3 meses com movimentação</span><small>Passe o cursor pelo gráfico para ver os valores de cada mês.</small></div></div></article></section>'''

def transaction_screen(open_menu=True):
    menu='''<div id="qa-menu" class="ld-select-menu is-bottom" style="left:0;top:0;width:260px;max-height:190px"><div class="ld-select-menu-scroll"><button type="button" class="ld-select-option"><span class="ld-select-option-copy"><span class="ld-select-option-label"><span>Receita (Entrada)</span></span></span></button><button type="button" class="ld-select-option is-selected is-highlighted"><span class="ld-select-option-copy"><span class="ld-select-option-label"><span>Despesa (Saída)</span></span></span><span class="ld-select-check">✓</span></button></div></div>''' if open_menu else ''
    return f'''<div class="modal-overlay" style="position:fixed;inset:0;display:grid;place-items:center;padding:18px"><div class="ld-dialog finance36-dialog finance40-transaction-dialog" role="dialog"><div class="modal-header"><div><span class="finance40-dialog-kicker">Financeiro</span><h3 class="modal-title">Nova movimentação</h3></div><button type="button" class="icon-btn">×</button></div><form class="modal-body finance40-transaction-form"><div class="finance40-form-stack"><div class="finance40-form-grid"><div class="input-group"><label class="label">Tipo</label><div id="qa-trigger">{select_trigger('Despesa (Saída)')}</div></div><div class="input-group"><label class="label">Data</label><input class="input finance40-control" value="11/08/2026"></div></div><div class="input-group"><label class="label">Valor (R$)</label><input class="input finance40-control" value="140,00"></div><div class="input-group"><label class="label">Categoria ou método</label><input class="input finance40-control" placeholder="Ex.: Pix, aluguel, produtos"></div><div class="input-group"><label class="label">Descrição <span class="text-muted">(opcional)</span></label><textarea class="input finance40-control finance40-textarea" rows="3" placeholder="Detalhes da movimentação"></textarea></div></div><div class="modal-footer finance40-dialog-footer"><button type="button" class="btn">Cancelar</button><button type="button" class="btn btnPrimary">Salvar movimentação</button></div></form></div>{menu}</div>'''

def matrix_screen():
    items=[
        ('Financeiro','Tipo de movimentação',select_trigger('Receita (Entrada)')),
        ('WhatsApp','Pedir confirmação',select_trigger('24h antes',True)),
        ('Configuração','Duração do serviço',select_trigger('60 min',True)),
        ('Administração','Status do espaço',select_trigger('Ativo')),
    ]
    cards=''.join(f'''<article class="qa-control-card"><span>{area}</span><label>{label}</label>{control}</article>''' for area,label,control in items)
    return f'''<section class="qa-matrix"><header><span>Contrato único de controles</span><h2>Dropdowns do produto</h2><p>Mesma geometria, estados, tipografia e menu em todas as áreas.</p></header><div class="qa-grid">{cards}</div><div class="qa-open-example"><div><span>Exemplo aberto</span><strong>O menu não usa o popup nativo do navegador.</strong></div><div id="qa-trigger">{select_trigger('24h antes',True)}</div></div><div id="qa-menu" class="ld-select-menu is-bottom" style="left:0;top:0;width:240px;max-height:190px"><div class="ld-select-menu-scroll"><button type="button" class="ld-select-option"><span class="ld-select-option-copy"><span class="ld-select-option-label"><span>12h antes</span></span></span></button><button type="button" class="ld-select-option is-selected is-highlighted"><span class="ld-select-option-copy"><span class="ld-select-option-label"><span>24h antes</span></span></span><span class="ld-select-check">✓</span></button><button type="button" class="ld-select-option"><span class="ld-select-option-copy"><span class="ld-select-option-label"><span>48h antes</span></span></span></button></div></div></section>'''

extra='''
body{margin:0;padding:28px;background:var(--ld-color-canvas,#faf7f8);color:var(--ld-color-ink-strong,#2d2428)}*{box-sizing:border-box}
.qa-matrix{max-width:1080px;margin:0 auto;display:grid;gap:22px}.qa-matrix header>span,.qa-control-card>span,.qa-open-example>div>span{color:var(--ld-color-accent);font:760 .66rem/1.2 var(--ld-font-ui);letter-spacing:.07em;text-transform:uppercase}.qa-matrix h2{margin:6px 0 5px;font:800 1.65rem/1.1 var(--ld-font-ui)}.qa-matrix p{margin:0;color:var(--ld-color-ink-soft);font:560 .82rem/1.5 var(--ld-font-ui)}.qa-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.qa-control-card{display:grid;gap:8px;padding:18px;border:1px solid var(--ld-color-line);border-radius:var(--ld-radius-card);background:var(--ld-color-raised);box-shadow:var(--ld-shadow-xs)}.qa-control-card label{font:700 .72rem/1.3 var(--ld-font-ui)}.qa-open-example{display:grid;grid-template-columns:minmax(0,1fr) minmax(230px,320px);align-items:end;gap:18px;padding:18px;border-top:1px solid var(--ld-color-line)}.qa-open-example>div:first-child{display:grid;gap:5px}.qa-open-example strong{font:700 .8rem/1.4 var(--ld-font-ui)}
@media(max-width:640px){body{padding:14px}.qa-grid{grid-template-columns:1fr}.qa-open-example{grid-template-columns:1fr;padding-inline:0}.qa-matrix{gap:16px}}
'''
html='''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'''+css+extra+'''</style></head><body><div id="root"></div><script>
function placeMenu(){const t=document.querySelector('#qa-trigger .ld-select-trigger');const m=document.querySelector('#qa-menu');if(!t||!m)return;const r=t.getBoundingClientRect();const pad=12,gap=6;const w=Math.min(Math.max(r.width,180),innerWidth-pad*2);m.style.width=w+'px';m.style.left=Math.min(Math.max(pad,r.left),Math.max(pad,innerWidth-pad-w))+'px';const h=Math.min(190,m.scrollHeight||190);const below=innerHeight-r.bottom-pad;const above=r.top-pad;if(below>=Math.min(h,150)||below>=above){m.classList.remove('is-top');m.classList.add('is-bottom');m.style.top=Math.min(innerHeight-pad-h,r.bottom+gap)+'px'}else{m.classList.remove('is-bottom');m.classList.add('is-top');m.style.top=Math.max(pad,r.top-gap-h)+'px'}}
function drawChart(){const canvas=document.querySelector('#qa-chart');if(!canvas)return;const rect=canvas.parentElement.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));canvas.style.width=rect.width+'px';canvas.style.height=rect.height+'px';const c=canvas.getContext('2d');c.scale(dpr,dpr);const W=rect.width,H=rect.height;const pad={l:52,r:18,t:16,b:34};const plotW=W-pad.l-pad.r,plotH=H-pad.t-pad.b;const labels=['Mar','Abr','Mai','Jun','Jul','Ago'];const entries=[0,0,70,0,95,140],expenses=[0,0,28,0,60,44],balance=[null,null,42,null,35,96];const max=160;c.font='600 11px Manrope,sans-serif';c.textBaseline='middle';for(let i=0;i<=4;i++){const y=pad.t+plotH*(i/4);c.strokeStyle='#eadfe3';c.lineWidth=1;c.beginPath();c.moveTo(pad.l,y);c.lineTo(W-pad.r,y);c.stroke();c.fillStyle='#89767e';const value=Math.round(max*(1-i/4));c.fillText(value===0?'R$ 0':'R$ '+value,2,y)}const group=plotW/labels.length;labels.forEach((lab,i)=>{const cx=pad.l+group*(i+.5);c.fillStyle='#75646c';c.textAlign='center';c.fillText(lab,cx,H-13);const vals=[entries[i],expenses[i]];vals.forEach((v,j)=>{if(!v)return;const bw=Math.min(18,group*.2),x=cx+(j?3:-3)-bw*(j?0:1),h=plotH*(v/max),y=pad.t+plotH-h;c.fillStyle=j?'#b85b70':'#2f7d62';c.beginPath();c.roundRect(x,y,bw,h,[6,6,2,2]);c.fill()})});c.strokeStyle='#8e2e55';c.lineWidth=2;c.lineJoin='round';c.lineCap='round';let started=false;for(let i=0;i<balance.length;i++){if(balance[i]==null){started=false;continue}const x=pad.l+group*(i+.5),y=pad.t+plotH-plotH*(balance[i]/max);if(!started){c.beginPath();c.moveTo(x,y);started=true}else c.lineTo(x,y);let next=balance[i+1];if(next==null||i===balance.length-1){c.stroke();started=false}c.fillStyle='#fff';c.strokeStyle='#8e2e55';c.beginPath();c.arc(x,y,3,0,Math.PI*2);c.fill();c.stroke();c.strokeStyle='#8e2e55'}c.textAlign='start'}
addEventListener('resize',()=>{placeMenu();drawChart()});
</script></body></html>'''

screens={'chart':chart_screen(),'transaction':transaction_screen(True),'controls':matrix_screen()}
cases=[]
for name in screens:
    cases += [(name,1440,900),(name,390,844)]
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    for name,w,h in cases:
        page=browser.new_page(viewport={'width':w,'height':h})
        page.set_content(html,wait_until='domcontentloaded')
        page.locator('#root').evaluate('(el, markup)=>el.innerHTML=markup',screens[name])
        page.evaluate('placeMenu();drawChart()')
        page.wait_for_timeout(120)
        metrics=page.evaluate('''() => { const doc=document.documentElement; const menu=document.querySelector('#qa-menu'); const mr=menu?.getBoundingClientRect(); const over=Array.from(document.querySelectorAll('body *')).filter(el=>{const s=getComputedStyle(el);return el.scrollWidth>el.clientWidth+2 && !['auto','scroll'].includes(s.overflowX)}).map(el=>el.className||el.tagName).slice(0,15); return {sw:doc.scrollWidth,cw:doc.clientWidth,overflow:over,menu:mr?{left:mr.left,right:mr.right,top:mr.top,bottom:mr.bottom}:null}; }''')
        menu_ok=not metrics['menu'] or (metrics['menu']['left']>=-1 and metrics['menu']['right']<=w+1 and metrics['menu']['top']>=-1 and metrics['menu']['bottom']<=h+1)
        fail=metrics['sw']>metrics['cw']+2 or bool(metrics['overflow']) or not menu_ok
        fn=f'{name}-{w}x{h}.png'; page.screenshot(path=str(OUT/fn),full_page=False)
        results.append({'name':name,'viewport':f'{w}x{h}','fail':fail,'menu_ok':menu_ok,**metrics,'shot':fn})
        page.close()
    browser.close()
(OUT/'matrix.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps({'cases':len(results),'failures':sum(r['fail'] for r in results),'details':[r for r in results if r['fail']]},ensure_ascii=False,indent=2))

# Contact sheet for review/delivery.
shots=[]
for key in ['chart-1440x900.png','transaction-1440x900.png','controls-1440x900.png','transaction-390x844.png','controls-390x844.png']:
    im=Image.open(OUT/key).convert('RGB')
    if '390x844' in key:
        target_h=500; target_w=round(im.width*target_h/im.height); im=im.resize((target_w,target_h))
    else:
        target_w=760; target_h=round(im.height*target_w/im.width); im=im.resize((target_w,target_h))
    shots.append((key,im))
canvas=Image.new('RGB',(1600,1460),'white')
draw=ImageDraw.Draw(canvas)
positions=[(20,55),(820,55),(20,570),(900,570),(1190,570)]
for (name,im),(x,y) in zip(shots,positions):
    canvas.paste(im,(x,y)); draw.text((x,y-24),name,fill='black')
canvas.save('/mnt/data/LashDesigner-4.0.0-Consistency-Preview.jpg',quality=91)
