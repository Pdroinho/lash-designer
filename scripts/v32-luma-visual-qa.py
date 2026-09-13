from __future__ import annotations
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'visual-output-v32'
OUT.mkdir(exist_ok=True)
CSS = (ROOT / 'src/luma-v32.css').read_text()

TOKENS = """
:root{
 --font-ui:'Manrope','Segoe UI',sans-serif;--font-display:'Fraunces',Georgia,serif;
 --surface-canvas:#f7f4f5;--surface-panel:#fffefe;--surface-raised:#fff;--surface-soft:#f2edef;
 --ink-strong:#2b1d24;--ink-body:#65565d;--ink-soft:#807078;--ink-faint:#9c8e94;
 --line-soft:#e6dfe2;--line-strong:#d8ccd1;--brand-action:#8f214d;--brand-soft:#f7eaf0;
 --shadow-sm:0 7px 22px rgba(42,28,36,.055);--shadow-dialog:0 32px 90px rgba(28,18,24,.24),0 4px 18px rgba(28,18,24,.10);
}
*{box-sizing:border-box}body{margin:0;background:#f7f4f5;font-family:var(--font-ui);color:#2b1d24}.stage{min-height:100vh;padding:34px}.shell{display:grid;grid-template-columns:218px minmax(0,1fr);gap:22px;max-width:1400px;margin:auto}.sidebar{min-height:720px;border:1px solid #e6dfe2;border-radius:22px;background:#fff;padding:22px 15px;color:#74676d}.sidebar h2{font:700 .74rem var(--font-ui);margin:0 0 28px;color:#30222a}.sidebar div{padding:10px 11px;border-radius:10px;font-size:.65rem}.sidebar .active{background:#f7eaf0;color:#8f214d;font-weight:800}.main{min-width:0}.mobile-stage{width:390px;max-width:100%;margin:auto}.drawer-bg{min-height:100vh;padding:40px;background:#f4eff1}.ghost{width:min(900px,80%);height:600px;margin:auto;border-radius:24px;background:#fff;border:1px solid #e6dfe2;opacity:.9}
"""
HEAD = f"<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>{TOKENS}{CSS}</style>"

STARTERS = """
<div class='luma32-starters'><span class='luma32-starters-label'>Sugestões para começar</span>
<button><span class='luma32-starter-mark'>01</span><span class='luma32-starter-copy'><small>Rentabilidade</small><strong>Quais serviços estão mais rentáveis agora?</strong></span><span class='luma32-starter-arrow'>→</span></button>
<button><span class='luma32-starter-mark'>02</span><span class='luma32-starter-copy'><small>Crescimento</small><strong>Como posso atrair mais clientes?</strong></span><span class='luma32-starter-arrow'>→</span></button>
<button><span class='luma32-starter-mark'>03</span><span class='luma32-starter-copy'><small>Prioridades</small><strong>Quais são os próximos 3 movimentos?</strong></span><span class='luma32-starter-arrow'>→</span></button></div>
"""

def header(drawer=False, thread=False):
    close = "<button class='luma32-close'>×</button>" if drawer else ''
    new = "<button class='luma32-new'>＋<span>Nova conversa</span></button>" if thread else ''
    sub = 'Consulta rápida' if drawer else 'Sua estrategista de beleza'
    return f"<header class='luma32-header'><div class='luma32-identity'><span class='luma32-monogram'>L</span><div><h2>Luma</h2><span>{sub}</span></div></div><div class='luma32-header-actions'><div class='luma32-usage'><strong>9</strong><span>de 12 hoje</span></div>{new}{close}</div></header>"

def composer(drawer=False):
    foot = '' if drawer else "<div class='luma32-composer-foot'><span>Enter envia</span><span>Shift + Enter quebra linha</span></div>"
    return f"<form class='luma32-composer'><div class='luma32-composer-shell'><span class='luma32-composer-mark'>L</span><textarea placeholder='{'Pergunte algo...' if drawer else 'Pergunte algo sobre seu negócio...'}'></textarea><button class='luma32-send'>↑</button></div>{foot}</form>"

def opening():
    return f"<section class='luma32-opening'><div class='luma32-opening-copy'><span class='luma32-kicker'>Luma acompanha seu negócio</span><h3>O que merece sua atenção agora?</h3><p>Analiso seus sinais e te ajudo a tomar decisões com mais clareza — sem transformar sua rotina em uma planilha.</p></div>{STARTERS}</section>"

def thread():
    return """
<div class='luma32-session-title'><span>Sua conversa com a Luma</span><i></i></div>
<article class='luma32-message is-user'><div class='luma32-message-head'><span>Você perguntou</span></div><div class='luma32-question'>Quais serviços estão mais rentáveis no mês de maio?</div></article>
<article class='luma32-message is-assistant'><div class='luma32-message-head'><span class='luma32-mini-mark'>L</span><strong>Luma analisou</strong></div><div class='luma32-answer'><p>Os serviços com melhor margem neste período são Volume Brasileiro, Lash Lifting e Brow Lamination. Volume Brasileiro combina ticket médio alto com boa recompra; Lash Lifting cresceu nas últimas semanas e merece mais espaço na agenda.\n\nEu priorizaria a divulgação do Volume Brasileiro e testaria uma campanha de reativação para clientes de Lash Lifting.</p></div></article>
<article class='luma32-message is-user'><div class='luma32-message-head'><span>Você perguntou</span></div><div class='luma32-question'>Qual deles eu faria primeiro?</div></article>
<article class='luma32-message is-assistant'><div class='luma32-message-head'><span class='luma32-mini-mark'>L</span><strong>Luma analisou</strong></div><div class='luma32-answer'><p>Começaria pelo Volume Brasileiro porque ele já combina margem, procura e recompra. Isso reduz o risco do teste e permite medir retorno rápido antes de ampliar a campanha.</p></div></article>
"""

def luma(drawer=False, has_thread=False):
    klass = f"luma32 luma32--{'drawer' if drawer else 'page'} {'has-thread' if has_thread else 'is-empty'}"
    body = thread() if has_thread else opening()
    return f"<div class='{klass}'>{header(drawer,has_thread)}<main class='luma32-workspace'><div class='luma32-thread'>{body}</div>{composer(drawer)}</main></div>"

def desktop_page(has_thread=False):
    side = "<aside class='sidebar'><h2>LASH DESIGNER</h2><div>Dashboard</div><div>Agenda</div><div>Clientes</div><div>Serviços</div><div>Financeiro</div><div class='active'>Luma</div><div>Relatórios</div><div>Configurações</div></aside>"
    return f"<!doctype html><html><head>{HEAD}</head><body><div class='stage'><div class='shell'>{side}<main class='main'><section class='luma32-page'>{luma(False,has_thread)}</section></main></div></div></body></html>"

def drawer_page(has_thread=False):
    return f"<!doctype html><html><head>{HEAD}</head><body><div class='drawer-bg'><div class='ghost'></div></div><div class='luma32-layer'><section class='luma32-drawer'>{luma(True,has_thread)}</section></div></body></html>"

def mobile_page(has_thread=False):
    return f"<!doctype html><html><head>{HEAD}</head><body><div class='mobile-stage'><section class='luma32-page'>{luma(False,has_thread)}</section></div></body></html>"

SCENARIOS = [
 ('page-empty', desktop_page(False), (1440,900)),
 ('page-thread', desktop_page(True), (1440,900)),
 ('page-empty-1024', desktop_page(False), (1024,768)),
 ('page-thread-1024', desktop_page(True), (1024,768)),
 ('drawer-empty', drawer_page(False), (1440,900)),
 ('drawer-thread', drawer_page(True), (1440,900)),
 ('page-mobile-empty', mobile_page(False), (390,844)),
 ('page-mobile-thread', mobile_page(True), (390,844)),
 ('drawer-mobile-empty', drawer_page(False), (390,844)),
 ('drawer-mobile-thread', drawer_page(True), (390,844)),
 ('page-small', mobile_page(False), (320,568)),
 ('drawer-small', drawer_page(True), (320,568)),
]

async def main():
    failures=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        for name,html,(width,height) in SCENARIOS:
            page=await browser.new_page(viewport={'width':width,'height':height})
            await page.set_content(html,wait_until='load')
            await page.wait_for_timeout(320)
            metrics=await page.evaluate("""() => {
              const root=document.documentElement;
              const els=[...document.querySelectorAll('.luma32,.luma32-starters,.luma32-starters button,.luma32-message,.luma32-composer-shell,.luma32-drawer')];
              const clipped=els.filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.className);
              const drawer=document.querySelector('.luma32-drawer');
              const rect=drawer?.getBoundingClientRect();
              return {sw:root.scrollWidth,cw:root.clientWidth,clipped,drawer:rect?{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}:null};
            }""")
            if metrics['sw']>metrics['cw']+1 or metrics['clipped']:
                failures.append((name,width,height,metrics))
            await page.screenshot(path=str(OUT/f'{name}-{width}x{height}.png'),full_page=True)
            await page.close()
        await browser.close()
    print(f'{len(SCENARIOS)-len(failures)}/{len(SCENARIOS)} cenários Luma 3.2 sem overflow/clipping estrutural')
    for item in failures: print('FAIL',item)
    raise SystemExit(1 if failures else 0)

if __name__=='__main__': asyncio.run(main())
