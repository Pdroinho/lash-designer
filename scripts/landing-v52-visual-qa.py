from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'visual-output-landing-v52'
OUT.mkdir(exist_ok=True)
css_files = ['design-system.css','landing.css','landing-v52.css']
css = '\n'.join((ROOT/'src'/name).read_text() for name in css_files)
base = 'http://127.0.0.1:8765/'

wordmark='''<span class="sales-wordmark sales-wordmark-v25"><i>✦</i><span><strong>Lash Designer</strong><small>AGENDA &amp; GESTÃO</small></span></span>'''
html=f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="{base}"><style>{css}</style></head><body class="landing-body"><div class="sales-page ldx-page">
<header class="ldx-header"><div class="ldx-shell ldx-nav"><a class="ldx-brand">{wordmark}</a><nav><a>Experiência</a><a>Produto</a><a>Luma</a><a>Planos</a><a>FAQ</a></nav><div class="ldx-nav-actions"><a class="ldx-login">Acessar</a><button class="ldx-btn ldx-btn-primary ldx-btn-nav">Começar agora</button><button class="ldx-menu">☰</button></div></div></header>
<main>
<section class="ldx-hero"><div class="ldx-aurora"></div><div class="ldx-shell ldx-hero-inner"><div class="ldx-hero-copy ldx-reveal is-visible"><span class="ldx-kicker">O sistema feito para lash designers</span><h1>Seu studio, com cara de <em>negócio de verdade.</em></h1><p>Agenda, clientes, WhatsApp, financeiro e inteligência de negócio em um só lugar — bonito para sua cliente, claro para você.</p><div class="ldx-hero-actions"><button class="ldx-btn ldx-btn-primary">Criar meu espaço →</button><a class="ldx-text-link">Ver o produto</a></div><div class="ldx-hero-meta"><span>A partir de <strong>R$ 49,90/mês</strong> no anual</span><i></i><span>Sem taxa por agendamento</span></div></div>
<div class="ldx-product-orbit ldx-reveal is-visible"><div class="ldx-product-tabs"><button class="is-active"><span>Visão geral</span><i></i></button><button><span>Agenda</span><i></i></button><button><span>Luma</span><i></i></button></div><div class="ldx-product-peek ldx-product-peek-left"><div class="ldx-phone-shell"><img src="public/landing/product/mobile-dashboard.webp"></div><span>Funciona no celular</span></div><div class="ldx-browser ldx-product-main"><div class="ldx-browser-bar"><span></span><span></span><span></span><small>app.lashdesigner.com.br</small></div><div class="ldx-product-frame"><img class="is-active" src="public/landing/product/dashboard.webp"></div></div><div class="ldx-product-peek ldx-product-peek-right"><img src="public/landing/mobile-booking-720.webp"><div><small>PARA SUA CLIENTE</small><strong>Agendamento pelo navegador</strong></div></div><div class="ldx-product-caption"><span>Visão geral</span><strong>Seu dia inteiro, sem caça ao contexto.</strong><p>Horários, clientes, pendências e movimento financeiro em uma leitura clara.</p></div></div></div></section>
<section class="ldx-value-line"><div class="ldx-shell"><span>◫ Agenda organizada</span><span>◎ Link próprio</span><span>◌ WhatsApp conectado</span><span>◇ Financeiro no mesmo lugar</span></div></section>
<section class="ldx-story ldx-story-client"><div class="ldx-shell ldx-story-grid"><div class="ldx-story-copy ldx-reveal is-visible"><span class="ldx-kicker">A experiência dela</span><h2>Seu atendimento começa antes da maca.</h2><p>Com seu link, a cliente encontra serviços e horários e agenda pelo celular — sem instalar aplicativo ou esperar você responder.</p><ul><li>✓ <span><strong>Seu link, sua presença</strong><small>Uma experiência pública pensada para parecer parte do seu studio.</small></span></li><li>✓ <span><strong>Menos conversa para marcar horário</strong><small>A cliente escolhe o que precisa no próprio navegador.</small></span></li><li>✓ <span><strong>Celular em primeiro lugar</strong><small>O fluxo acompanha a forma como suas clientes realmente chegam até você.</small></span></li></ul></div><div class="ldx-editorial-collage ldx-reveal is-visible"><figure class="ldx-editorial-main"><img src="public/landing/mobile-booking-1440.webp"></figure><figure class="ldx-editorial-detail"><img src="public/landing/result-640.webp"></figure><div class="ldx-editorial-note"><span><strong>Agendamento online</strong><small>sem aplicativo para a cliente</small></span></div></div></div></section>
<section class="ldx-story ldx-story-owner"><div class="ldx-shell ldx-owner-grid"><div class="ldx-owner-visual ldx-reveal is-visible"><div class="ldx-browser ldx-owner-browser"><div class="ldx-browser-bar"><span></span><span></span><span></span><small>Visão geral</small></div><img src="public/landing/product/dashboard.webp"></div><img class="ldx-owner-photo" src="public/landing/planning-720.webp"></div><div class="ldx-story-copy ldx-reveal is-visible"><span class="ldx-kicker">A sua visão</span><h2>Você abre o painel e sabe o que está acontecendo.</h2><p>Próximos horários, clientes e dinheiro deixam de viver em lugares diferentes. O negócio fica legível enquanto você continua atendendo.</p><div class="ldx-inline-features"><span>Agenda</span><span>Clientes</span><span>Indicadores</span><span>Financeiro</span></div></div></div></section>
<section class="ldx-whatsapp"><div class="ldx-shell ldx-whatsapp-panel ldx-reveal is-visible"><div class="ldx-whatsapp-copy"><span class="ldx-kicker">Relacionamento sem retrabalho</span><h2>Menos “só confirmando seu horário” digitado à mão.</h2><p>Conecte seu WhatsApp para confirmações e lembretes e acompanhe conversas no mesmo fluxo do atendimento.</p><button class="ldx-btn ldx-btn-light">Quero organizar minha rotina →</button></div><div class="ldx-whatsapp-list"><span>✓ <strong>Confirmações e lembretes</strong></span><span>✓ <strong>Conversas com nome e contexto</strong></span><span>✓ <strong>Mensagens manuais quando precisar</strong></span><span>✓ <strong>Sem abandonar seu número</strong></span></div></div></section>
<section class="ldx-luma"><div class="ldx-shell ldx-luma-grid"><div class="ldx-luma-copy ldx-reveal is-visible"><span class="ldx-kicker">Luma</span><h2>Quando quiser entender o negócio, é só perguntar.</h2><p>A Luma lê indicadores do seu espaço e ajuda a transformar movimento em próximos passos — sem você montar mais uma planilha.</p><div class="ldx-prompt-list"><span>“Como foi meu mês?”</span><span>“Onde minha agenda está ociosa?”</span><span>“O que merece atenção agora?”</span></div></div><div class="ldx-luma-visual ldx-reveal is-visible"><img class="ldx-luma-editorial" src="public/ai/luma-editorial.webp"><div class="ldx-browser ldx-luma-browser"><div class="ldx-browser-bar"><span></span><span></span><span></span><small>Luma</small></div><img src="public/landing/product/luma.webp"></div></div></div></section>
<section class="ldx-feature-index"><div class="ldx-shell"><div class="ldx-feature-heading ldx-reveal is-visible"><span class="ldx-kicker">Tudo no mesmo sistema</span><h2>Tudo que sustenta um studio profissional.</h2><p>Sem transformar sua rotina em uma coleção de ferramentas diferentes.</p></div><div class="ldx-feature-groups ldx-reveal is-visible"><div><small>ATENDIMENTO</small><span>Agenda e horários</span><span>Agendamento online</span><span>Experiência mobile</span></div><div><small>CLIENTES</small><span>Cadastro e histórico</span><span>WhatsApp Center</span><span>Confirmações e lembretes</span></div><div><small>NEGÓCIO</small><span>Financeiro</span><span>Visão do negócio</span><span>Luma</span></div><div><small>MARCA</small><span>Link do seu espaço</span><span>Identidade visual</span><span>Setup guiado</span></div></div></div></section>
<section class="ldx-pricing"><div class="ldx-shell ldx-pricing-grid"><div class="ldx-pricing-copy ldx-reveal is-visible"><span class="ldx-kicker">Planos</span><h2>O produto inteiro. Você escolhe o ritmo.</h2><p>Mensal, trimestral, semestral ou anual. Sem taxa por agendamento e com o valor total visível antes da compra.</p><div class="ldx-promo-note"><strong>Boas-vindas</strong><span>No mensal, o 1º mês sai por R$ 39,90.</span></div></div><div class="ldx-plan-list ldx-reveal is-visible">{''.join(f'<article class="{"is-featured" if n=="Anual" else ""}"><div class="ldx-plan-name"><span>{n}</span>{"<small>melhor valor</small>" if n=="Anual" else ""}</div><div class="ldx-plan-price"><strong>{p}<i>/mês</i></strong><small>{t}</small></div><button class="ldx-plan-cta">Escolher →</button></article>' for n,p,t in [('Mensal','R$ 59,90','cobrado mês a mês'),('Trimestral','R$ 56,63','R$ 169,90 por 3 meses'),('Semestral','R$ 54,98','R$ 329,90 por 6 meses'),('Anual','R$ 49,90','R$ 598,80 por 12 meses')])}</div></div></section>
<section class="ldx-faq"><div class="ldx-shell ldx-faq-grid"><div class="ldx-faq-heading ldx-reveal is-visible"><span class="ldx-kicker">Antes de começar</span><h2>Perguntas diretas. Respostas também.</h2><p>Sem esconder regra importante atrás de letra pequena.</p></div><div class="ldx-faq-list ldx-reveal is-visible"><details open><summary>Vou precisar abandonar o WhatsApp?<span>+</span></summary><p>Não. O WhatsApp continua sendo seu canal de relacionamento.</p></details><details><summary>Preciso saber mexer com sistemas?<span>+</span></summary></details><details><summary>Minhas clientes precisam instalar aplicativo?<span>+</span></summary></details><details><summary>A Luma é obrigatória?<span>+</span></summary></details></div></div></section>
<section class="ldx-final"><div class="ldx-aurora ldx-aurora-final"></div><div class="ldx-shell ldx-final-panel ldx-reveal is-visible"><div><span class="ldx-kicker">Seu trabalho já é profissional</span><h2>Seu negócio também pode parecer assim.</h2><p>Crie uma experiência organizada para você e para cada cliente que chega pelo seu link.</p></div><button class="ldx-btn ldx-btn-light">Criar meu espaço →</button></div></section>
</main>
<footer class="ldx-footer"><div class="ldx-shell ldx-footer-panel"><div class="ldx-footer-brand"><span class="sales-wordmark sales-wordmark-v25 is-inverse"><i>✦</i><span><strong>Lash Designer</strong><small>AGENDA &amp; GESTÃO</small></span></span><p>Agenda, clientes, WhatsApp, financeiro e inteligência de negócio para lash designers.</p></div><div class="ldx-footer-links"><div><strong>Produto</strong><a>Experiência</a><a>Produto</a><a>Luma</a><a>Planos</a></div><div><strong>Acesso</strong><a>Acessar meu espaço</a><a>Suporte</a></div><div><strong>Legal</strong><a>Termos</a><a>Privacidade</a></div></div><div class="ldx-footer-bottom"><span>© 2026 Lash Designer.</span><small>Feito para quem quer que a experiência do negócio acompanhe a qualidade do atendimento.</small></div></div></footer>
</div></body></html>'''
fixture=OUT/'fixture.html'; fixture.write_text(html)
viewports=[(390,844),(768,900),(1366,900),(1920,1080)]
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--allow-file-access-from-files'])
    for w,h in viewports:
        page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
        page.set_content(html, wait_until='load')
        page.wait_for_timeout(250)
        metrics=page.evaluate('''() => {const d=document.documentElement; const bad=Array.from(document.querySelectorAll('body *')).filter(el=>{const s=getComputedStyle(el); return el.scrollWidth>el.clientWidth+3 && !['auto','scroll'].includes(s.overflowX) && el.clientWidth>0}).map(el=>el.className||el.tagName).slice(0,20); return {sw:d.scrollWidth,cw:d.clientWidth,bad};}''')
        fail=metrics['sw']>metrics['cw']+2
        shot=OUT/f'landing-{w}x{h}.png'
        page.screenshot(path=str(shot),full_page=True)
        hero=OUT/f'hero-{w}x{h}.png'
        page.screenshot(path=str(hero),full_page=False)
        results.append({'viewport':f'{w}x{h}','fail':fail,**metrics,'height':page.evaluate('document.documentElement.scrollHeight')})
        page.close()
    browser.close()
(OUT/'matrix.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps({'cases':len(results),'failures':sum(r['fail'] for r in results),'details':[r for r in results if r['fail']]},ensure_ascii=False,indent=2))

# Compact preview: desktop + mobile hero and representative full-page strips.
items=[]
for name,target_w in [('hero-1366x900.png',760),('hero-390x844.png',330),('landing-1366x900.png',760),('landing-390x844.png',330)]:
    im=Image.open(OUT/name).convert('RGB')
    ratio=target_w/im.width
    im=im.resize((target_w,round(im.height*ratio)))
    items.append((name,im))
canvas=Image.new('RGB',(1160,1550),'white'); draw=ImageDraw.Draw(canvas)
positions=[(20,40),(810,40),(20,620),(810,620)]
for (name,im),(x,y) in zip(items,positions):
    # crop full pages for readable preview
    if name.startswith('landing-') and im.height>850: im=im.crop((0,0,im.width,850))
    canvas.paste(im,(x,y)); draw.text((x,y-22),name,fill='black')
canvas.save('/mnt/data/LashDesigner-5.2.0-Landing-Preview.jpg',quality=90)
