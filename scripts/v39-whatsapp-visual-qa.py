from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'visual-output-v39-whatsapp'; OUT.mkdir(exist_ok=True)
css='\n'.join((ROOT/'src'/f).read_text() for f in ['styles.css','design-system.css','product-system-v33.css','product-controls-v40.css','foundation-v24.css','whatsapp-v39.css'])

def tabs(active='conversations'):
    labels=[('conversations','▢','Conversas'),('automations','◌','Automações'),('campaigns','◇','Campanhas'),('connection','⚙','Conexão')]
    return '<nav class="wa39-tabs">'+''.join(f'<button class="{"is-active" if k==active else ""}"><span>{i}</span><span>{l}</span></button>' for k,i,l in labels)+'</nav>'

def shell(content,active='conversations'):
    return f'''<div class="wa39"><header class="wa39-topbar"><div><span class="wa39-eyebrow">Central de relacionamento</span><h2>WhatsApp</h2><p>Conversas, confirmações e relacionamento com clientes em um único fluxo.</p></div><div class="wa39-health is-connected"><i></i><span>Conectado</span></div></header>{tabs(active)}{content}</div>'''

def conversation():
    left='''<aside class="wa39-conversation-pane"><div class="wa39-pane-head"><div><strong>Conversas</strong><small>2 contatos</small></div><button class="wa39-icon-button">+</button></div><label class="wa39-search"><span>⌕</span><input placeholder="Buscar nome ou número"></label><div class="wa39-conversation-list"><button class="wa39-conversation is-active"><span class="wa39-avatar">MS</span><span class="wa39-conversation-copy"><span class="wa39-conversation-line"><strong>Maria Souza</strong><time>agora</time></span><span class="wa39-conversation-phone">(79) 99179-0876</span><span class="wa39-conversation-line is-preview"><span>Você: Perfeito, te espero amanhã!</span></span></span></button><button class="wa39-conversation"><span class="wa39-avatar">•</span><span class="wa39-conversation-copy"><span class="wa39-conversation-line"><strong>Contato sem nome</strong><time>12 min</time></span><span class="wa39-conversation-phone">(35) 99916-7985</span><span class="wa39-conversation-line is-preview"><span>Oi, queria saber os horários</span><b>1</b></span></span></button></div></aside>'''
    chat='''<main class="wa39-chat-pane"><header class="wa39-chat-head"><div class="wa39-chat-person"><span class="wa39-avatar is-large">MS</span><div><strong>Maria Souza</strong><span>(79) 99179-0876</span></div></div><button class="wa39-luma-reply">✦ Sugerir resposta</button></header><div class="wa39-messages"><article class="wa39-message is-inbound"><p>Oi! Você tem um horário amanhã à tarde?</p><footer><time>20:37</time></footer></article><article class="wa39-message is-outbound"><p>Tenho sim. Posso te atender às 14:30 ou 16:00.</p><footer><time>20:38</time></footer></article><article class="wa39-message is-inbound"><p>14:30 fica perfeito 😊</p><footer><time>20:39</time></footer></article></div><form class="wa39-composer"><button class="wa39-composer-tool">⌕</button><textarea placeholder="Escreva uma mensagem…"></textarea><button class="wa39-send">➤</button></form></main>'''
    ctx='''<aside class="wa39-context-pane"><section class="wa39-context-profile"><span class="wa39-avatar is-profile">MS</span><strong>Maria Souza</strong><span>(79) 99179-0876</span><div class="wa39-context-tags"><span>Cliente</span><span>Marketing autorizado</span></div></section><section class="wa39-context-card"><header><span>Próximo horário</span><span>◷</span></header><strong>Volume brasileiro</strong><p>ter, 11 ago, 14:30</p><div class="wa39-appointment-price">R$ 160,00</div><span class="wa39-status is-success">Presença confirmada</span></section><section class="wa39-context-stats"><div><span>Atendimentos</span><strong>4</strong></div><div><span>Última mensagem</span><strong>agora</strong></div></section></aside>'''
    return shell(f'<section class="wa39-inbox">{left}{chat}{ctx}</section>')

def empty():
    return shell('''<section class="wa39-empty-inbox"><div class="wa39-empty-orb">▢</div><span>Caixa de entrada</span><h3>Suas conversas começam aqui.</h3><p>Inicie uma conversa ou aguarde uma mensagem de cliente. As respostas recebidas entram automaticamente nesta central.</p><button>+ Nova conversa</button><small>WhatsApp conectado e pronto para receber mensagens.</small></section>''')

def automations():
    content='''<section class="wa39-automation-layout"><div class="wa39-automation-main"><article class="wa39-automation-hero"><div><span>Agenda automática</span><h3>Confirmação de presença</h3><p>Defina o fluxo uma vez. O Lash Designer acompanha as respostas e destaca apenas o que precisa de você.</p></div><button class="wa39-toggle is-on"><span></span></button></article><div class="wa39-flow-card"><div class="wa39-flow-step"><b>1</b><label><span>Pedir confirmação</span><button class="ld-select-trigger ld-select-trigger--compact"><span class="ld-select-value"><span>24h antes</span></span><span class="ld-select-chevron">⌄</span></button></label></div><span class="wa39-flow-arrow">→</span><div class="wa39-flow-step"><b>2</b><label><span>Se não responder, lembrar</span><button class="ld-select-trigger ld-select-trigger--compact"><span class="ld-select-value"><span>8h depois</span></span><span class="ld-select-chevron">⌄</span></button></label></div><span class="wa39-flow-arrow">→</span><div class="wa39-flow-step"><b>3</b><label><span>Sem resposta vira pendência</span><button class="ld-select-trigger ld-select-trigger--compact"><span class="ld-select-value"><span>4h antes</span></span><span class="ld-select-chevron">⌄</span></button></label></div></div><div class="wa39-reply-rule"><span>✓</span><div><strong>Resposta simples para a cliente</strong><span>Ela responde <b>1</b> para confirmar ou <b>2</b> para avisar que não poderá ir. Nenhum código aleatório é necessário no fluxo normal.</span></div></div><label class="wa39-template"><span>Mensagem de confirmação</span><textarea>Oi Maria! Seu horário de Volume Brasileiro no Studio Bella está chegando. Responda 1 para confirmar ou 2 se não puder comparecer.</textarea></label><div class="wa39-variable-row"><span>Variáveis</span><button>{{nome}}</button><button>{{servico}}</button><button>{{data}}</button><button>{{hora}}</button><button>{{espaco}}</button></div><article class="wa39-compact-setting"><div><strong>Cancelar automaticamente se a cliente recusar</strong><p>Desligado por padrão: a recusa aparece para você decidir o que fazer.</p></div><button class="wa39-toggle"><span></span></button></article></div><aside class="wa39-preview-card"><div class="wa39-preview-head"><span>Prévia</span><small>Como a cliente recebe</small></div><div class="wa39-preview-chat"><div class="wa39-preview-day">Amanhã</div><p class="is-out">Oi Maria! Seu horário de Volume Brasileiro no Studio Bella está chegando. Responda 1 para confirmar ou 2 se não puder comparecer.</p><p class="is-in">1</p><div class="wa39-preview-system">✓ Presença confirmada</div></div><label class="wa39-test-field"><span>Enviar um teste</span><input placeholder="(11) 99999-9999"><button>Testar</button></label></aside></section>'''
    return shell(content,'automations')

def campaigns():
    content='''<section class="wa39-campaigns"><div class="wa39-section-intro"><span>Relacionamento</span><h3>Campanhas preparadas, sem misturar com o atendimento.</h3><p>O modelo e a audiência ficam organizados aqui. Envios em massa continuam bloqueados até a camada operacional estar pronta.</p></div><div class="wa39-campaign-overview"><article><div class="wa39-stat-icon">◉</div><span>Audiência autorizada</span><strong>37</strong><small>de 82 clientes com consentimento ativo</small></article><article><div class="wa39-stat-icon">◇</div><span>Status dos disparos</span><strong class="is-text">Em preparação</strong><small>Modelo e testes disponíveis; broadcast permanece protegido.</small></article></div><article class="wa39-campaign-editor"><header><div><span>Modelo promocional</span><strong>Mensagem padrão</strong><small>Use uma mensagem curta e fácil de responder.</small></div><button class="wa39-toggle is-on"><span></span></button></header><label class="wa39-template"><textarea>Oi Maria, temos uma novidade especial para você esta semana no Studio Bella. Responda esta mensagem para saber mais.</textarea></label><div class="wa39-campaign-actions"><label><span>Testar em um número</span><input placeholder="(11) 99999-9999"></label><button>Enviar teste</button><button class="is-primary">Salvar modelo</button></div></article></section>'''
    return shell(content,'campaigns')

def connection():
    content='''<section class="wa39-connection-grid"><article class="wa39-connection-status"><div class="wa39-connection-mark is-connected">▯</div><div><span>Conexão</span><h3>WhatsApp conectado</h3><p>A central está pronta para enviar e receber mensagens.</p></div><button>↻ Verificar</button></article><article class="wa39-connection-card"><header><div><span>Recebimento de mensagens</span><strong>Recebimento preparado</strong></div><span>▢</span></header><p>As respostas das clientes são encaminhadas para a inbox do Lash Designer.</p><dl><div><dt>Última recebida</dt><dd>agora</dd></div><div><dt>Último envio</dt><dd>2 min</dd></div></dl></article><article class="wa39-connection-card"><header><div><span>Infraestrutura</span><strong>Gerenciada pelo Lash Designer</strong></div><span>⌁</span></header><p>Os dados técnicos da instância ficam ocultos e são gerenciados pela plataforma.</p><span class="wa39-connected-note">✓ Nenhuma ação necessária agora</span></article></section>'''
    return shell(content,'connection')

SCREENS={'conversation':conversation(),'empty':empty(),'automations':automations(),'campaigns':campaigns(),'connection':connection()}
html='''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'''+css+'''body{margin:0;padding:24px;background:#faf7f8}*{box-sizing:border-box}</style></head><body><div id="root"></div></body></html>'''
CASES=[]
for name in SCREENS:
    CASES.append((name,1440,900))
    CASES.append((name,390,844))
results=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    for name,w,h in CASES:
        pg=b.new_page(viewport={'width':w,'height':h})
        pg.set_content(html,wait_until='domcontentloaded')
        pg.locator('#root').evaluate('(el, markup) => el.innerHTML = markup',SCREENS[name])
        pg.wait_for_timeout(80)
        metrics=pg.evaluate("""() => {const root=document.documentElement; const bad=Array.from(document.querySelectorAll('.wa39 *')).filter(el=>el.scrollWidth>el.clientWidth+2 && getComputedStyle(el).overflowX!=='auto').map(el=>el.className||el.tagName).slice(0,20); return {sw:root.scrollWidth,cw:root.clientWidth,bad};}""")
        fail=metrics['sw']>metrics['cw']+2 or bool(metrics['bad'])
        fn=f'{name}-{w}x{h}.png'; pg.screenshot(path=str(OUT/fn),full_page=False)
        results.append({'name':name,'viewport':f'{w}x{h}','fail':fail,**metrics,'shot':fn})
        pg.close()
    b.close()
(OUT/'matrix.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps({'cases':len(results),'failures':sum(r['fail'] for r in results),'details':[r for r in results if r['fail']]},ensure_ascii=False,indent=2))
