from __future__ import annotations
import asyncio, base64, mimetypes
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'visual-output-v30'
OUT.mkdir(exist_ok=True)
CSS = (ROOT / 'src/booking-v30.css').read_text()

def datauri(rel: str) -> str:
    path = ROOT / rel
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()
I = {
  'logo': datauri('public/placeholders/tenant-placeholder.png'),
  'classic': datauri('public/services/service-classico.webp'),
  'volume': datauri('public/services/service-volume-brasileiro.webp'),
  'hybrid': datauri('public/services/service-hibrido.webp'),
  'lift': datauri('public/services/service-lash-lifting.webp'),
  'result': datauri('public/landing/result-640.webp'),
}
HEAD = f"""<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>:root{{--font-ui:'Segoe UI',sans-serif;--font-display:Georgia,'Times New Roman',serif;--primary-600:#942b55}}body{{margin:0}}{CSS}</style>"""

def top(step: int) -> str:
    labels = ['Serviço','Data','Horário','Confirmar']
    buttons=[]
    for n,label in enumerate(labels,1):
        cls = 'is-current' if n==step else ('is-complete' if n<step else '')
        disabled = ' disabled' if n>step else ''
        buttons.append(f"<button class='{cls}'{disabled}><span>0{n}</span><strong>{label}</strong></button>")
    return f"<header class='booking30-topbar'><button class='booking30-brand'><img src='{I['logo']}'><span><strong>Studio Aurora</strong><small>Agendamento online</small></span></button><nav class='booking30-steps'>{''.join(buttons)}</nav><div class='booking30-step-count'><strong>{step}</strong><span>/ 4</span></div></header>"

def dossier(selected: bool) -> str:
    if selected:
        rows="<div><dt>Serviço</dt><dd>Volume brasileiro</dd></div><div><dt>Data</dt><dd>10/08/2026</dd></div><div><dt>Horário</dt><dd>14:30</dd></div><div class='is-total'><dt>Valor</dt><dd>R$ 160,00</dd></div>"
        photo=I['volume']; over='<small>Serviço escolhido</small><strong>Volume brasileiro</strong>'
        note='Confira antes de reservar'
    else:
        rows="<div><dt>Serviço</dt><dd><em>A escolher</em></dd></div><div><dt>Data</dt><dd><em>A escolher</em></dd></div><div><dt>Horário</dt><dd><em>A escolher</em></dd></div>"
        photo=I['result']; over='<small>Seu momento</small><strong>Um horário só seu.</strong>'
        note='Atualiza enquanto você escolhe'
    return f"<aside class='booking30-dossier'><div class='booking30-dossier-head'><span>Sua reserva</span><small>{note}</small></div><div class='booking30-dossier-photo'><img src='{photo}'><div>{over}</div></div><dl class='booking30-dossier-list'>{rows}</dl><div class='booking30-dossier-note'><span>✦</span><p><strong>Sem criar conta.</strong><br>Você acompanha tudo pelo WhatsApp.</p></div></aside>"

def wrap(step: int, workspace: str, selected: bool) -> str:
    return f"<!doctype html><html><head>{HEAD}</head><body><main class='booking30'><div class='booking30-shell'>{top(step)}<div class='booking30-body'><section class='booking30-workspace'>{workspace}</section>{dossier(selected)}</div><footer class='booking30-footer'><button>‹ Voltar</button><span>Reserva online · atendimento continua humano</span></footer></div></main></body></html>"

def services_html() -> str:
    cards=[]
    for key,name,mins,price in [('classic','Clássico fio a fio',90,'R$ 120,00'),('volume','Volume brasileiro',120,'R$ 160,00'),('hybrid','Híbrido',105,'R$ 145,00'),('lift','Lash lifting',75,'R$ 110,00')]:
        cards.append(f"<button class='booking30-service'><div class='booking30-service-photo'><img src='{I[key]}'></div><div class='booking30-service-copy'><strong>{name}</strong><span>{mins} min</span></div><div class='booking30-service-price'><strong>{price}</strong><span>↗</span></div></button>")
    workspace=f"<div class='booking30-kicker'><span>Serviço</span><i></i></div><div class='booking30-heading'><h1>Qual cuidado você quer hoje?</h1><p>Escolha o atendimento e veja os horários disponíveis.</p></div><div class='booking30-services'>{''.join(cards)}</div>"
    return wrap(1,workspace,False)

def confirm_html(more: bool=False) -> str:
    detail = "<p class='booking30-consent-detail'>Opcional. O espaço poderá enviar promoções e novidades neste WhatsApp. Você pode mudar essa preferência depois em Meus horários.</p>" if more else ''
    workspace=f"<div class='booking30-kicker'><span>Confirmar</span><i></i></div><div class='booking30-heading'><h1>Últimos detalhes.</h1><p>Seu nome e WhatsApp bastam para reservar.</p></div><div class='booking30-confirm'><div class='booking30-mobile-review'><img src='{I['volume']}'><div><small>Seu horário</small><strong>Volume brasileiro</strong><span>10/08/2026 · 14:30</span></div><b>R$ 160,00</b></div><div class='booking30-fields'><label><span>Seu nome</span><input value='Pedro Henrique'></label><label><span>WhatsApp</span><input value='+55 (35) 99916-7985'></label></div><div class='booking30-meta-row'><p class='booking30-privacy'>♡ Número usado para identificar e confirmar a reserva.</p><div class='booking30-consent'><label><input type='checkbox'><span>Receber novidades e ofertas</span></label><button>Ler mais</button></div></div>{detail}<button class='booking30-confirm-button'><span>Reservar às 14:30</span><i>→</i></button></div>"
    return wrap(4,workspace,True)

SCENARIOS = [('services',services_html()),('confirm',confirm_html()),('confirm-more',confirm_html(True))]
VIEWPORTS = [(1440,900),(1024,768),(390,844),(320,568)]

async def main():
    failures=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        for name,html in SCENARIOS:
            for width,height in VIEWPORTS:
                page=await browser.new_page(viewport={'width':width,'height':height})
                await page.set_content(html,wait_until='load')
                await page.wait_for_timeout(60)
                m=await page.evaluate("""() => { const r=document.documentElement; const clipped=[...document.querySelectorAll('.booking30-shell,.booking30-workspace,.booking30-dossier,.booking30-fields,.booking30-consent')].filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.className); return {sw:r.scrollWidth,cw:r.clientWidth,clipped}; }""")
                if m['sw']>m['cw']+1 or m['clipped']:
                    failures.append((name,width,height,m))
                await page.screenshot(path=str(OUT/f'{name}-{width}x{height}.png'),full_page=True)
                await page.close()
        await browser.close()
    print(f'{len(SCENARIOS)*len(VIEWPORTS)-len(failures)}/{len(SCENARIOS)*len(VIEWPORTS)} cenários visuais sem overflow/clipping estrutural')
    for f in failures: print('FAIL',f)
    raise SystemExit(1 if failures else 0)

if __name__ == '__main__': asyncio.run(main())
