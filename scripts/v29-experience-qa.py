from pathlib import Path
from playwright.sync_api import sync_playwright
import base64, json
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'visual-output-v29'; OUT.mkdir(exist_ok=True)
css='\n'.join((ROOT/'src'/f).read_text() for f in ['styles.css','design-system.css','foundation-v24.css','booking-v29.css'])
def data(rel):
 p=ROOT/rel
 if not p.exists(): return ''
 mime={'.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'}.get(p.suffix.lower(),'application/octet-stream')
 return f'data:{mime};base64,'+base64.b64encode(p.read_bytes()).decode()
imgs={k:data(v) for k,v in {
 'service':'public/services/service-volume-brasileiro.webp',
 'service2':'public/services/service-classico.webp',
 'tenant':'public/placeholders/tenant-placeholder.png',
 'fallback':'public/landing/treatment-720.webp'}.items()}
base=f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>{css}body{{margin:0}}</style></head><body><div id="root"></div><script>
const I={json.dumps(imgs)}; const root=document.getElementById('root'); const screen=new URLSearchParams(location.search).get('screen')||'booking4';
function booking(step,more=false){{
 const label=['Serviço','Data','Horário','Confirmar'][step-1];
 const heading={{1:['Escolha o serviço','Toque no atendimento que deseja.'],2:['Qual dia fica melhor?','Os dias disponíveis já aparecem primeiro.'],3:['Escolha um horário','Só mostramos horários realmente livres.'],4:['Confirme seu horário','Nome e WhatsApp. Só isso.']}}[step];
 const summary=step>2?`<div class="booking29-side-slot"><span><small>Data</small><strong>10/08/2026</strong></span>${{step>3?'<span><small>Horário</small><strong>14:30</strong></span>':''}}</div>`:'';
 const mobileSummary=step>1&&step<4?`<div class="booking29-mobile-summary"><span><small>Serviço</small>Volume brasileiro</span>${{step>2?'<span><small>Data</small>10/08/2026</span>':''}}</div>`:'';
 let content='';
 if(step===1) content=`<div class="booking29-services"><button class="booking29-service"><img src="${{I.service}}"><span><strong>Volume brasileiro</strong><small>90 min · R$ 160,00</small></span><b>›</b></button><button class="booking29-service"><img src="${{I.service2}}"><span><strong>Fio a fio clássico</strong><small>120 min · R$ 140,00</small></span><b>›</b></button></div>`;
 if(step===2) content=`<div class="booking29-date"><div class="dateScrollerWrapper"><div class="dateScrollerContainer">${{['Sáb 8','Dom 9','Seg 10','Ter 11','Qua 12','Qui 13'].map((x,i)=>`<div class="dateCard ${{i===2?'selected':''}}"><span class="dateCardWeek">${{x.split(' ')[0]}}</span><span class="dateCardDay">${{x.split(' ')[1]}}</span><span class="dateCardMonth">Ago</span></div>`).join('')}}</div></div></div>`;
 if(step===3) content=`<div class="booking29-time-grid">${{['09:00','09:30','10:00','10:30','11:00','14:00','14:30','15:00'].map(x=>`<button>${{x}}</button>`).join('')}}</div>`;
 if(step===4) content=`<div class="booking29-confirm"><div class="booking29-review"><img src="${{I.service}}"><div class="booking29-review-service"><small>Serviço</small><strong>Volume brasileiro</strong><span>R$ 160,00 · 90 min</span></div><div class="booking29-review-when"><small>Quando</small><strong>10/08/2026</strong><span>14:30</span></div></div><div class="booking29-fields"><label><span>Seu nome</span><input value="Pedro Henrique"></label><label><span>WhatsApp</span><input value="+55 (35) 99916-7985"></label></div><div class="booking29-trust"><p class="booking29-privacy">✓ Usamos seu WhatsApp só para identificar e confirmar o horário.</p><div class="booking27-consent"><label class="booking27-consent-choice"><input type="checkbox"><span>Quero receber novidades e ofertas.</span></label><button class="booking27-consent-more">Ler mais</button>${{more?'<p class="booking27-consent-detail">Opcional. O espaço poderá enviar promoções e novidades neste WhatsApp. Isso não interfere no agendamento e pode ser alterado depois em Meus horários.</p>':''}}</div></div><button class="booking29-confirm-button">Confirmar horário →</button></div>`;
 return `<main class="booking25"><div class="booking29-shell"><aside class="booking29-side"><div class="booking29-brand"><img src="${{I.tenant}}"><div><strong>Studio Aurora</strong><span>Agendamento online</span></div></div><div class="booking29-intro"><h2>Seu horário, do seu jeito.</h2><p>Escolha em poucos passos. Sem trocar mensagens.</p></div><figure class="booking29-visual"><img src="${{step>1?I.service:I.fallback}}"><figcaption><small>${{step>1?'Serviço escolhido':'Reserva rápida'}}</small><strong>${{step>1?'Volume brasileiro':'Escolha e confirme em minutos'}}</strong></figcaption></figure>${{summary}}<small class="booking29-side-note">Sem app. Atendimento humano.</small></aside><section class="booking29-main"><header class="booking29-mobile-brand"><div><img src="${{I.tenant}}"></div><span><strong>Studio Aurora</strong><small>Agendamento online</small></span></header><div class="booking29-progress"><div class="booking29-progress-meta"><span><b>0${{step}}</b>${{label}}</span><small>${{step}} de 4</small></div><div class="booking29-progress-track">${{[1,2,3,4].map(n=>`<i class="${{n<=step?'is-active':''}}"></i>`).join('')}}</div></div>${{mobileSummary}}<div class="booking29-heading"><h1>${{heading[0]}}</h1><p>${{heading[1]}}</p></div><div class="booking29-content">${{content}}</div><footer class="booking29-actions"><button>‹ Voltar</button></footer></section></div></main>`
}}
let m=screen.match(/booking(\\d)/); root.innerHTML=booking(m?Number(m[1]):4,screen.includes('more'));
</script></body></html>'''
CASES=[]
for w,h in [(320,568),(360,800),(390,844),(412,915)]:
 for step in [1,2,3,4]: CASES.append((f'booking{step}',w,h))
CASES += [('booking1',768,900),('booking4',768,900),('booking1',1024,768),('booking4',1024,768),('booking1',1280,800),('booking4',1280,800),('booking1',1440,900),('booking4',1440,900),('booking1',1920,1080),('booking4',1920,1080),('booking4more',320,568),('booking4more',390,844),('booking4more',1024,768),('booking4more',1440,900)]
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for screen,w,h in CASES:
  pg=b.new_page(viewport={'width':w,'height':h}); pg.set_content(base.replace("new URLSearchParams(location.search).get('screen')||'booking4'",f"'{screen}'"),wait_until='domcontentloaded'); pg.wait_for_timeout(120)
  metrics=pg.evaluate("""() => { const root=document.documentElement; const bad=Array.from(document.querySelectorAll('h1,h2,h3,p,label,strong,span,button')).filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),t=(el.textContent||'').trim(); return t.length>6&&r.width>0&&r.width<34&&r.height>(parseFloat(s.fontSize)||16)*2.25}).map(el=>(el.textContent||'').trim().slice(0,50)); const clipped=Array.from(document.querySelectorAll('.booking29-shell,.booking29-main,.booking29-review,.booking29-fields,.booking27-consent')).filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.className); return {sw:root.scrollWidth,cw:root.clientWidth,bad,clipped}; }""")
  fail=metrics['sw']>metrics['cw']+1 or bool(metrics['bad']) or bool(metrics['clipped'])
  fn=f'{screen}-{w}x{h}.png'; pg.screenshot(path=str(OUT/fn),full_page=False); results.append({'screen':screen,'viewport':f'{w}x{h}','fail':fail,**metrics,'shot':fn}); pg.close()
 b.close()
(OUT/'matrix.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps({'cases':len(results),'failures':sum(r['fail'] for r in results),'details':[r for r in results if r['fail']]},ensure_ascii=False,indent=2))
