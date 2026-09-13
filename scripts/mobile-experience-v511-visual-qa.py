from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import base64
import mimetypes

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'visual-output-mobile511'
OUT.mkdir(exist_ok=True)
css = '\n'.join((ROOT/'src'/f).read_text() for f in [
  'styles.css','design-system.css','product-system-v33.css','product-controls-v40.css','foundation-v24.css',
  'shell-v24.css','dashboard-v24.css','agenda-v24.css','booking-v30.css','mobile-app-v510.css',
  'mobile-app-v510-part3.css','mobile-app-v510-part4.css','mobile-experience-v511.css'
])

HEAD = f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>{css}\n*{{box-sizing:border-box}} body{{margin:0;background:var(--surface-canvas);font-family:var(--font-ui);color:var(--ink-strong)}} button,input{{font:inherit}} .qa-shell{{min-height:100dvh}} .qa-content{{padding:8px 12px 106px}} </style></head><body>'''

TABBAR='''<nav class="ld-mobile-tabbar" aria-label="Navegação principal mobile"><button class="ld-mobile-tabbar-item is-active"><span class="ld-mobile-tabbar-icon">⌂</span><span>Início</span></button><button class="ld-mobile-tabbar-item"><span class="ld-mobile-tabbar-icon">□</span><span>Agenda</span></button><button class="ld-mobile-tabbar-item"><span class="ld-mobile-tabbar-icon">○</span><span>Clientes</span></button><button class="ld-mobile-tabbar-item"><span class="ld-mobile-tabbar-icon">◇</span><span>WhatsApp</span></button><button class="ld-mobile-tabbar-item"><span class="ld-mobile-tabbar-icon">•••</span><span>Mais</span></button></nav>'''

def app(content, active='Início'):
    tabs = TABBAR.replace('ld-mobile-tabbar-item is-active', 'ld-mobile-tabbar-item', 1)
    label = f'<span>{active}</span>'
    tabs = tabs.replace(f'class="ld-mobile-tabbar-item"><span class="ld-mobile-tabbar-icon">□</span>{label}', f'class="ld-mobile-tabbar-item is-active"><span class="ld-mobile-tabbar-icon">□</span>{label}') if active == 'Agenda' else tabs
    tabs = tabs.replace(f'class="ld-mobile-tabbar-item"><span class="ld-mobile-tabbar-icon">○</span>{label}', f'class="ld-mobile-tabbar-item is-active"><span class="ld-mobile-tabbar-icon">○</span>{label}') if active == 'Clientes' else tabs
    if active == 'Início':
        tabs = tabs.replace('class="ld-mobile-tabbar-item"><span class="ld-mobile-tabbar-icon">⌂</span><span>Início</span>', 'class="ld-mobile-tabbar-item is-active"><span class="ld-mobile-tabbar-icon">⌂</span><span>Início</span>', 1)
    return HEAD + f'''<div class="ld-shell has-mobile-tabbar qa-shell"><main class="ld-main"><header class="ld-topbar"><div class="ld-topbar-left"><img class="ld-mobile-topbar-brand" src="/brand/logo-symbol.png"><div class="ld-page-heading"><h1 class="ld-page-title">{active}</h1></div></div><div class="ld-topbar-actions"><button class="icon-btn">◌</button></div></header><div class="ld-page"><div class="ld-page-inner qa-content">{content}</div></div></main>{tabs}</div></body></html>'''

dashboard='''<div class="ld-dashboard-page"><section class="ld-mobile-dashboard-stage"><header class="ld-mobile-dashboard-intro"><div><span>segunda-feira, 17 de agosto</span><h1>Boa tarde, <em>Amanda</em>.</h1><p>Você tem 4 atendimentos hoje.</p></div><button>□</button></header><button class="ld-mobile-next-card has-appointment"><span class="ld-mobile-next-card-media"><img src="/dashboard/human-studio.webp"></span><span class="ld-mobile-next-card-content"><small>Próxima cliente</small><strong class="ld-mobile-next-time">14:30</strong><span class="ld-mobile-next-person">Catherine Almeida</span><span class="ld-mobile-next-service">Volume brasileiro</span></span><span class="ld-mobile-next-card-action">→</span></button><section class="ld-mobile-business-pulse"><div class="ld-mobile-business-pulse-main"><span>Previsão de hoje</span><strong>R$ 780,00</strong></div><div class="ld-mobile-business-pulse-meta"><span><b>8</b><small>novas clientes<br>em 30 dias</small></span><span><b>3</b><small>presenças<br>confirmadas</small></span><span class="has-attention"><b>1</b><small>pede sua<br>atenção</small></span></div></section></section><div class="grid grid-2-1"><div class="column"><div class="card ld-dashboard-upcoming"><div class="cardHeader"><h3 class="cardTitle">Próximos agendamentos</h3><button class="btn btn-ghost">Ver todos</button></div><div class="mobile-appointment-list"><div class="mobile-appointment-card"><div class="mobile-appointment-header"><div style="display:flex;gap:10px;align-items:center"><div class="user-avatar-mini">MC</div><div><div style="font-weight:700">Marina Costa</div><div style="font-size:.65rem;color:var(--ink-soft)">Lash lifting</div></div></div><button class="icon-btn">•••</button></div><div class="mobile-appointment-row"><span>15:45</span><span class="status-badge status-success">Confirmada</span></div></div></div></div></div></div></div>'''

agenda='''<div class="ld-agenda"><div class="ld-agenda-tabs"><button class="ld-agenda-tab is-active">Calendário</button><button class="ld-agenda-tab">Horários</button><button class="ld-agenda-tab">Bloqueios</button></div><section class="ld-mobile-agenda-view"><header class="ld-mobile-agenda-head"><div><span>Agenda</span><h2>Agosto <em>2026</em></h2></div><div class="ld-mobile-agenda-head-actions"><button>Hoje</button><button class="ld-mobile-agenda-add">＋</button></div></header><div class="ld-mobile-day-rail"><button><span>Sáb</span><strong>15</strong><i></i></button><button><span>Dom</span><strong>16</strong><i></i></button><button class="is-selected is-today"><span>Seg</span><strong>17</strong><i></i></button><button><span>Ter</span><strong>18</strong><i></i></button><button><span>Qua</span><strong>19</strong><i></i></button><button><span>Qui</span><strong>20</strong><i></i></button><button><span>Sex</span><strong>21</strong><i></i></button></div><div class="ld-mobile-agenda-summary"><div><span>segunda-feira, 17 de agosto</span><strong>3 atendimentos</strong></div><div class="ld-mobile-agenda-nav"><button>‹</button><button>›</button></div></div><div class="ld-mobile-agenda-timeline"><button class="ld-mobile-agenda-event"><span class="ld-mobile-agenda-time"><strong>14:30</strong><small>próximo</small></span><span class="ld-mobile-agenda-line"><i style="background:var(--status-success-ink)"></i></span><span class="ld-mobile-agenda-event-body"><span class="ld-mobile-agenda-event-top"><strong>Catherine Almeida</strong><em class="status-badge status-success">Confirmada</em></span><span>Volume brasileiro</span><small>14:30 — 16:00</small></span></button><button class="ld-mobile-agenda-event"><span class="ld-mobile-agenda-time"><strong>16:30</strong><small></small></span><span class="ld-mobile-agenda-line"><i style="background:var(--status-warning-ink)"></i></span><span class="ld-mobile-agenda-event-body"><span class="ld-mobile-agenda-event-top"><strong>Bianca Souza</strong><em class="status-badge status-pending">Aguardando</em></span><span>Manutenção</span><small>16:30 — 17:30</small></span></button><button class="ld-mobile-agenda-event"><span class="ld-mobile-agenda-time"><strong>18:00</strong><small></small></span><span class="ld-mobile-agenda-line"><i style="background:var(--status-info-ink)"></i></span><span class="ld-mobile-agenda-event-body"><span class="ld-mobile-agenda-event-top"><strong>Laura Mendes</strong><em class="status-badge status-info">Agendada</em></span><span>Clássico fio a fio</span><small>18:00 — 19:00</small></span></button></div></section></div>'''

clients='''<div class="card client-admin-page"><section class="client-mobile-overview"><div class="client-mobile-overview-copy"><span>Sua comunidade</span><strong>128</strong><p>94 clientes têm visita registrada.</p></div><div class="client-mobile-highlight" style="--client-accent:var(--brand-soft)"><div class="user-avatar-mini">CA</div><span><small>Maior relacionamento</small><strong>Catherine Almeida</strong><em>R$ 2.940,00</em></span></div></section><label class="client-search"><span>⌕</span><input placeholder="Buscar cliente"><button>×</button></label><div class="client-mobile-list"><article class="client-mobile-card" style="--client-accent:var(--brand-soft)"><div class="user-avatar-mini client-mobile-avatar">MC</div><div class="client-mobile-main"><strong>Marina Costa</strong><span>(11) 99998-4455</span><div class="client-mobile-tags"><em class="is-ok">Promoções autorizadas</em></div></div><div class="client-mobile-value"><small>Total</small><strong>R$ 820,00</strong></div></article><article class="client-mobile-card" style="--client-accent:var(--status-info-bg)"><div class="user-avatar-mini client-mobile-avatar">BS</div><div class="client-mobile-main"><strong>Bianca Souza</strong><span>(11) 98812-1040</span><div class="client-mobile-tags"><em>Sem promoções</em></div></div><div class="client-mobile-value"><small>Total</small><strong>R$ 460,00</strong></div></article><article class="client-mobile-card" style="--client-accent:var(--status-warning-bg)"><div class="user-avatar-mini client-mobile-avatar">LM</div><div class="client-mobile-main"><strong>Laura Mendes</strong><span>laura@email.com</span><div class="client-mobile-tags"><em class="is-ok">Promoções autorizadas</em></div></div><div class="client-mobile-value"><small>Total</small><strong>R$ 1.280,00</strong></div></article></div></div>'''

booking_service='''<main class="booking30"><div class="booking30-shell"><header class="booking30-topbar"><button class="booking30-brand"><img src="/placeholders/tenant-placeholder.png"><span><strong>Studio Aurora</strong><small>Agendamento online</small></span></button><nav class="booking30-steps"><button class="is-current"><span>01</span><strong>Serviço</strong></button><button><span>02</span><strong>Data</strong></button><button><span>03</span><strong>Horário</strong></button><button><span>04</span><strong>Confirmar</strong></button></nav><div class="booking30-step-count"><strong>1</strong><span>/ 4</span></div></header><div class="booking30-body"><section class="booking30-workspace"><div class="booking30-heading"><h1>Qual cuidado você quer hoje?</h1><p>Escolha o atendimento e veja os horários disponíveis.</p></div><div class="booking30-services"><button class="booking30-service"><div class="booking30-service-photo"><img src="/services/service-volume-brasileiro.webp"><span class="booking30-service-index">01</span></div><div class="booking30-service-copy"><strong>Volume brasileiro</strong><span>90 min</span></div><div class="booking30-service-price"><strong>R$ 180,00</strong><span>↗</span></div></button><button class="booking30-service"><div class="booking30-service-photo"><img src="/services/service-lash-lifting.webp"><span class="booking30-service-index">02</span></div><div class="booking30-service-copy"><strong>Lash lifting</strong><span>60 min</span></div><div class="booking30-service-price"><strong>R$ 150,00</strong><span>↗</span></div></button></div></section></div></div></main>'''

booking_time='''<main class="booking30"><div class="booking30-shell"><header class="booking30-topbar"><button class="booking30-brand"><img src="/placeholders/tenant-placeholder.png"><span><strong>Studio Aurora</strong><small>Agendamento online</small></span></button><nav class="booking30-steps"><button class="is-complete"><span>01</span><strong>Serviço</strong></button><button class="is-complete"><span>02</span><strong>Data</strong></button><button class="is-current"><span>03</span><strong>Horário</strong></button><button><span>04</span><strong>Confirmar</strong></button></nav><div class="booking30-step-count"><strong>3</strong><span>/ 4</span></div></header><div class="booking30-body"><section class="booking30-workspace"><div class="booking30-heading"><h1>Escolha o seu horário.</h1><p>Estes horários estão livres agora.</p></div><div class="booking30-mobile-summary"><span><small>Serviço</small><strong>Volume brasileiro</strong></span><span><small>Data</small><strong>19/08/2026</strong></span></div><div class="booking30-times"><div class="booking30-mobile-time-groups"><section><header><strong>Manhã</strong><span>até 11:59</span></header><div><button>09:00 <span>→</span></button><button>10:30 <span>→</span></button></div></section><section><header><strong>Tarde</strong><span>12:00 — 17:59</span></header><div><button>13:30 <span>→</span></button><button>15:00 <span>→</span></button><button>16:30 <span>→</span></button></div></section><section><header><strong>Noite</strong><span>a partir das 18:00</span></header><div><button>18:00 <span>→</span></button><button>19:30 <span>→</span></button></div></section></div></div></section></div></div></main>'''

screens={'dashboard':app(dashboard,'Início'),'agenda':app(agenda,'Agenda'),'clients':app(clients,'Clientes'),'booking-service':HEAD+booking_service+'</body></html>','booking-time':HEAD+booking_time+'</body></html>'}

def as_data_uri(rel):
    path = ROOT / 'public' / rel.lstrip('/')
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"

assets = {
    '/dashboard/human-studio.webp': as_data_uri('/dashboard/human-studio.webp'),
    '/brand/logo-symbol.png': as_data_uri('/brand/logo-symbol.png'),
    '/placeholders/tenant-placeholder.png': as_data_uri('/placeholders/tenant-placeholder.png'),
    '/services/service-volume-brasileiro.webp': as_data_uri('/services/service-volume-brasileiro.webp'),
    '/services/service-lash-lifting.webp': as_data_uri('/services/service-lash-lifting.webp'),
}
for screen_name, html in list(screens.items()):
    for src, data in assets.items():
        html = html.replace(src, data)
    screens[screen_name] = html

results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    for name,html in screens.items():
        for w,h in [(320,780),(390,844),(430,900)]:
            page=browser.new_page(viewport={'width':w,'height':h})
            page.set_content(html,wait_until='domcontentloaded')
            page.wait_for_timeout(250)
            metrics=page.evaluate('''() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,body:document.body.scrollWidth})''')
            fail=metrics['sw']>metrics['cw']+2
            shot=f'{name}-{w}.png'
            page.screenshot(path=str(OUT/shot),full_page=False)
            results.append({'screen':name,'viewport':w,'fail':fail,**metrics,'shot':shot})
            page.close()
    browser.close()
(OUT/'matrix.json').write_text(json.dumps(results,indent=2,ensure_ascii=False))
print(json.dumps({'cases':len(results),'failures':sum(r['fail'] for r in results)},indent=2))
