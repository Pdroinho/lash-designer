import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api } from './api'
import {
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  Globe,
  Menu,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Users,
  Wallet,
  X,
} from './components/Icons'
import { LandingCheckout } from './components/LandingCheckout'
import { currencyBRLFromCents } from './commercial'
import { PUBLIC_TEAM_PLANS, validTeamPlans, orderedTeamPlans, type TeamPlan } from './teamPlans'
import './landing.css'
import './landing-v53.css'
import './landing-v54.css'
import { gsap, ScrollTrigger, SplitText } from 'gsap/all'

gsap.registerPlugin(ScrollTrigger, SplitText)

const productViews = [
  {
    id: 'agenda',
    label: 'Agenda',
    title: 'Um agendamento entra sem bagunçar seu fluxo.',
    description: 'Cadastre, confirme e acompanhe horários sem depender da memória ou de conversas antigas.',
    image: '/landing/product/agenda.webp',
    videoMp4: '/landing/product/product-flow.mp4',
    videoWebm: '/landing/product/product-flow.webm',
    alt: 'Fluxo real de agendamento dentro do Lash Designer',
  },
  {
    id: 'dashboard',
    label: 'Visão geral',
    title: 'O dia inteiro cabe em uma tela.',
    description: 'Horários, clientes, pendências e movimento financeiro sem procurar informação em cinco lugares.',
    image: '/landing/product/dashboard.webp',
    alt: 'Dashboard real do Lash Designer',
  },
  {
    id: 'luma',
    label: 'Luma',
    title: 'Pergunte. A Luma lê o contexto do seu negócio.',
    description: 'Indicadores viram respostas simples quando você precisa decidir o próximo passo.',
    image: '/landing/product/luma.webp',
    alt: 'Luma dentro do Lash Designer',
  },
] as const

const faqItems = [
  ['Vou precisar abandonar o WhatsApp?', 'Não. O WhatsApp continua sendo seu canal de relacionamento. O Lash Designer organiza confirmações, lembretes e conversas junto da rotina do atendimento.'],
  ['Preciso saber mexer com sistemas?', 'Não. Depois da compra, um setup guiado ajuda a organizar marca, horários e serviços. O objetivo é deixar a operação clara desde o primeiro acesso.'],
  ['Como a cliente escolhe a profissional?', 'Pelo link do estúdio, ela encontra o serviço, escolhe entre as profissionais disponíveis e vê os horários daquela agenda. Tudo pelo navegador, sem instalar aplicativo.'],
  ['A Luma é obrigatória?', 'Não. Ela é uma assistente opcional para interpretar indicadores e sugerir próximos passos. Agenda, clientes, financeiro e gestão continuam funcionando sem IA.'],
  ['Quem acessa o WhatsApp do estúdio?', 'A conexão é compartilhada pelo estúdio e gerenciada pela administradora. Cada profissional tem seu próprio acesso à agenda, sem precisar compartilhar a senha da administração.'],
  ['Como peço ajuda?', 'Abra um chamado na central de suporte da plataforma, envie uma captura de tela se precisar e acompanhe as respostas e notificações no seu painel.'],
] as const

function BrandWordmark({ inverse = false }: { inverse?: boolean }) {
  return <span className={`ld53-brandmark ${inverse ? 'is-inverse' : ''}`}><img src={inverse ? '/brand/logo-horizontal-light.png' : '/brand/logo-horizontal-dark.png'} alt="Lash Designer" /></span>
}

function Cta({ children, className = '', location, onClick }: { children: ReactNode; className?: string; location: string; onClick: () => void }) {
  function track() {
    window.dispatchEvent(new CustomEvent('lashdesigner:cta', { detail: { location } }))
    const analyticsWindow = window as Window & { dataLayer?: Array<Record<string, unknown>> }
    analyticsWindow.dataLayer?.push({ event: 'landing_cta_click', location })
    onClick()
  }
  return <button type="button" className={className} onClick={track}>{children}</button>
}

function workspaceLoginUrl(slug: string) {
  const configured = String(import.meta.env.VITE_APP_BASE_URL ?? '').trim()
  try {
    const base = configured ? new URL(configured) : new URL(window.location.origin)
    const port = base.port ? `:${base.port}` : ''
    return `${base.protocol}//${slug}.${base.hostname.replace(/^www\./, '')}${port}/login?welcome=1`
  } catch { return '/acessar' }
}

export function LandingPage() {
  const landingRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [headerScrolled, setHeaderScrolled] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutTeamCode, setCheckoutTeamCode] = useState<TeamPlan['code']>('TEAM_3')
  const [teamPlans, setTeamPlans] = useState<readonly TeamPlan[]>(PUBLIC_TEAM_PLANS)
  const [checkoutAvailable, setCheckoutAvailable] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [activeView, setActiveView] = useState(0)
  const [activeStory, setActiveStory] = useState(0)
  const productPauseUntilRef = useRef(0)
  const storyPauseUntilRef = useRef(0)
  const [reduceMotion, setReduceMotion] = useState(false)
  const [referralToken] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('ref')?.trim() ?? '')
  const [returnWorkspace] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('workspace')?.trim().toLowerCase() ?? '')
  const [checkoutReturn] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('checkout') === 'return')
  const termsUrl = String(import.meta.env.VITE_TERMS_URL ?? '').trim() || '/termos'
  const privacyUrl = String(import.meta.env.VITE_PRIVACY_URL ?? '').trim() || '/privacidade'
  const supportUrl = String(import.meta.env.VITE_SUPPORT_URL ?? '').trim()

  useEffect(() => {
    document.body.classList.add('landing-body')
    document.title = 'Lash Designer — gestão para lash designers sem rotina manual'
    api<{ teamPlans?: unknown; checkoutAvailable?: boolean }>('/api/public/billing/plans').then(result => { setCatalogLoading(false); if (result.ok && validTeamPlans(result.data.teamPlans)) { setTeamPlans(orderedTeamPlans(result.data.teamPlans)); setCheckoutAvailable(result.data.checkoutAvailable === true) } })
    const syncHeader = () => setHeaderScrolled(window.scrollY > 16)
    syncHeader()
    window.addEventListener('scroll', syncHeader, { passive: true })
    return () => {
      window.removeEventListener('scroll', syncHeader)
      document.body.classList.remove('landing-body')
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduceMotion(media.matches)
    sync()
    media.addEventListener?.('change', sync)
    return () => media.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    if (reduceMotion) return
    const timer = window.setInterval(() => {
      const stage = landingRef.current?.querySelector('.ld53-product-stage')
      const rect = stage?.getBoundingClientRect()
      const visible = Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight)
      if (visible && document.visibilityState === 'visible' && Date.now() >= productPauseUntilRef.current) {
        setActiveView((current) => (current + 1) % productViews.length)
      }
    }, 5200)
    return () => window.clearInterval(timer)
  }, [reduceMotion])

  useEffect(() => {
    if (reduceMotion) return
    const timer = window.setInterval(() => {
      const stage = landingRef.current?.querySelector('.ld53-system')
      const rect = stage?.getBoundingClientRect()
      const visible = Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight)
      if (visible && document.visibilityState === 'visible' && Date.now() >= storyPauseUntilRef.current) {
        setActiveStory((current) => (current + 1) % 3)
      }
    }, 6500)
    return () => window.clearInterval(timer)
  }, [reduceMotion])

  function chooseProduct(index: number) {
    productPauseUntilRef.current = Date.now() + 9000
    setActiveView(index)
  }

  function chooseStory(index: number) {
    storyPauseUntilRef.current = Date.now() + 9000
    setActiveStory(index)
  }

  useLayoutEffect(() => {
    const root = landingRef.current
    if (!root) return

    type SplitInstance = { words?: Element[]; lines?: Element[]; revert: () => void }
    const Split = SplitText as unknown as {
      create: (target: string | Element, options?: Record<string, unknown>) => SplitInstance
    }

    const mm = gsap.matchMedia()
    let split: SplitInstance | null = null
    const sectionSplits: SplitInstance[] = []
    const context = gsap.context(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      split = Split.create('.ld54-hero-title', { type: 'words', wordsClass: 'ld54-hero-word' })
      if (split.words) {
        gsap.from(split.words, { y: 26, opacity: 0, duration: .72, stagger: .028, ease: 'power3.out', clearProps: 'transform,opacity' })
      }
      gsap.from('.ld54-hero-lede, .ld53-hero-actions, .ld53-hero-trust', { y: 16, opacity: 0, duration: .62, stagger: .08, delay: .16, ease: 'power3.out', clearProps: 'transform,opacity' })
      gsap.from('.ld53-product-stage', { y: 30, opacity: 0, duration: .86, delay: .2, ease: 'power3.out', clearProps: 'transform,opacity' })

      gsap.to('.ld54-glow-a', { xPercent: 9, yPercent: 5, duration: 7, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.to('.ld54-glow-b', { xPercent: -8, yPercent: -4, duration: 8.5, repeat: -1, yoyo: true, ease: 'sine.inOut' })

      ;(gsap.utils.toArray('.ld53-reveal') as HTMLElement[]).forEach((element) => {
        if (element.closest('.ld53-hero')) return
        gsap.from(element, {
          y: 22, opacity: 0, duration: .72, ease: 'power3.out', clearProps: 'transform,opacity',
          scrollTrigger: { trigger: element, start: 'top 88%', once: true },
        })
      })

      ;(gsap.utils.toArray('.ld54-section-title') as HTMLElement[]).forEach((title) => {
        const sectionSplit = Split.create(title, {
          type: 'lines', autoSplit: true, linesClass: 'ld54-section-line',
          onSplit(self: SplitInstance) {
            if (self.lines) {
              return gsap.from(self.lines, {
                y: 20, opacity: 0, duration: .68, stagger: .06, ease: 'power3.out', clearProps: 'transform,opacity',
                scrollTrigger: { trigger: title, start: 'top 88%', once: true },
              })
            }
          },
        })
        sectionSplits.push(sectionSplit)
      })


      ;(gsap.utils.toArray('[data-parallax]') as HTMLElement[]).forEach((element, index) => {
        gsap.to(element, {
          yPercent: index % 2 === 0 ? -8 : 8, ease: 'none',
          scrollTrigger: { trigger: element, start: 'top bottom', end: 'bottom top', scrub: 0.8 },
        })
      })


    }, root)

    mm.add('(min-width: 960px) and (prefers-reduced-motion: no-preference)', () => {
      const stage = root.querySelector<HTMLElement>('.ld53-product-stage')
      if (stage) {
        gsap.to(stage, {
          yPercent: -4, scale: 1.015, ease: 'none',
          scrollTrigger: { trigger: '.ld53-hero', start: '55% center', end: 'bottom top', scrub: 0.9 },
        })
      }
      gsap.to('.ld53-stage-side-left', { xPercent: -10, rotate: -2.5, ease: 'none', scrollTrigger: { trigger: '.ld53-product-stage', start: 'top 75%', end: 'bottom 20%', scrub: 0.8 } })
      gsap.to('.ld53-stage-side-right', { xPercent: 10, rotate: 2.5, ease: 'none', scrollTrigger: { trigger: '.ld53-product-stage', start: 'top 75%', end: 'bottom 20%', scrub: 0.8 } })
    })

    return () => {
      mm.revert()
      context.revert()
      sectionSplits.forEach((sectionSplit) => sectionSplit.revert())
      split?.revert()
    }
  }, [])


  const activeProduct = productViews[activeView]
  const price = (cents:number) => `R$ ${currencyBRLFromCents(cents,{minimumFractionDigits:2})}`
  function buyTeam(code: TeamPlan['code'] = 'TEAM_3') { setCheckoutTeamCode(code); setCheckoutOpen(true) }

  return <div ref={landingRef} className="sales-page ld53-page ld54-page">
    <a className="sales-skip" href="#conteudo">Pular para o conteúdo</a>

    {checkoutReturn && returnWorkspace ? <div className="sales-return-banner" role="status">
      <span><Check size={16} weight="bold" /> Pagamento em verificação. Entre no seu espaço para acompanhar a ativação.</span>
      <a href={workspaceLoginUrl(returnWorkspace)}>Entrar em {returnWorkspace} <ArrowRight size={15} /></a>
    </div> : null}

    <div className="ld53-announcement">
      <span>Seu estúdio cresce junto: planos para <strong>1 a 15 profissionais</strong>.</span>
      <a href="#preco">Ver planos <ArrowRight size={13} /></a>
    </div>

    <header className={`ld53-header ${headerScrolled ? 'is-scrolled' : ''}`}>
      <div className="ld53-shell ld53-nav">
        <a className="ld53-brand" href="#inicio" aria-label="Lash Designer — início"><BrandWordmark /></a>
        <nav className={menuOpen ? 'is-open' : ''} aria-label="Navegação principal">
          <a href="#como-funciona" onClick={() => setMenuOpen(false)}>Como funciona</a>
          <a href="#produto" onClick={() => setMenuOpen(false)}>Produto</a>
          <a href="#luma" onClick={() => setMenuOpen(false)}>Luma</a>
          <a href="#preco" onClick={() => setMenuOpen(false)}>Planos</a>
          <a className="ld53-mobile-login" href="/login">Acessar meu espaço</a>
        </nav>
        <div className="ld53-nav-actions">
          <a className="ld53-login" href="/login">Acessar</a>
          <Cta className="ld53-btn ld53-btn-primary ld53-btn-nav" location="header" onClick={() => buyTeam()}>Começar agora</Cta>
          <button type="button" className="ld53-menu" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
      </div>
    </header>

    <main id="conteudo">
      <section className="ld53-hero" id="inicio">
        <div className="ld54-hero-mesh" aria-hidden="true"><i className="ld54-glow-a" /><i className="ld54-glow-b" /><i className="ld54-grain" /></div>
        <div className="ld53-shell">
          <div className="ld53-hero-copy ld53-reveal is-visible">
            <span className="ld53-kicker">O sistema de gestão feito para lash designers</span>
            <h1 className="ld54-hero-title">Você cuida dos cílios. <em>O Lash Designer cuida da rotina.</em></h1>
            <p className="ld54-hero-lede">Sua cliente escolhe o serviço, a profissional e o horário pelo link do estúdio. Você acompanha as agendas da equipe, organiza as confirmações pelo WhatsApp e mantém clientes e financeiro no mesmo lugar.</p>
            <div className="ld53-hero-actions">
              <Cta className="ld53-btn ld53-btn-primary ld53-btn-xl" location="hero" onClick={() => buyTeam()}>Começar agora <ArrowRight size={18} /></Cta>
              <a className="ld53-video-link" href="#produto"><span aria-hidden="true">▶</span> Ver o produto</a>
            </div>
            <div className="ld53-hero-trust">
              <span><Check size={14} /> Sem taxa por agendamento</span>
              <span><Check size={14} /> Sem app para suas clientes</span>
              <span><Check size={14} /> A partir de {price(teamPlans[0].amountCents)}/mês por estúdio</span>
            </div>
          </div>

          <div className="ld53-product-stage ld53-reveal is-visible" id="produto" aria-label="Produto Lash Designer">
            <div className="ld53-stage-tabs" role="tablist" aria-label="Áreas do produto">
              {productViews.map((view, index) => <button key={view.id} type="button" role="tab" aria-selected={activeView === index} className={activeView === index ? 'is-active' : ''} onClick={() => chooseProduct(index)}>{view.label}<i /></button>)}
            </div>

            <div className="ld53-stage-side ld53-stage-side-left" aria-hidden="true">
              <div className="ld53-phone">
                <img src="/landing/product/mobile-dashboard.webp" alt="" />
              </div>
              <span>Seu estúdio no celular</span>
            </div>

            <div className="ld53-stage-main">
              <div className="ld53-app-frame" key={activeProduct.id}>
                {'videoMp4' in activeProduct && !reduceMotion
                  ? <video className="is-active ld541-state-enter" autoPlay muted loop playsInline poster={activeProduct.image} aria-label={activeProduct.alt}><source src={activeProduct.videoWebm} type="video/webm" /><source src={activeProduct.videoMp4} type="video/mp4" /></video>
                  : <img className="is-active ld541-state-enter" src={activeProduct.image} alt={activeProduct.alt} fetchPriority={activeView === 0 ? 'high' : 'auto'} />}
              </div>
              <div className="ld53-stage-caption" aria-live="polite">
                <strong>{activeProduct.title}</strong>
                <span>{activeProduct.description}</span>
              </div>
            </div>

            <div className="ld53-stage-side ld53-stage-side-right" aria-hidden="true">
              <div className="ld53-booking-card"><img src="/landing/mobile-booking-720.webp" alt="" /></div>
              <span>A cliente agenda pelo navegador</span>
            </div>
          </div>
        </div>
      </section>

      <section className="ld53-outcome-strip" aria-label="O que muda na rotina">
        <div className="ld53-shell">
          <span><Calendar size={20} /><strong>Ela agenda sem te chamar</strong></span>
          <span><MessageSquare size={20} /><strong>O WhatsApp acompanha o horário</strong></span>
          <span><Wallet size={20} /><strong>Você sabe como o negócio está indo</strong></span>
        </div>
      </section>

      <section className="ld53-problem" id="rotina">
        <div className="ld53-shell">
          <div className="ld53-problem-head ld53-reveal">
            <span className="ld53-kicker ld53-kicker-light">Feito para a rotina real</span>
            <h2 className="ld54-section-title">O problema não é atender. <em>É tudo que acontece entre um atendimento e outro.</em></h2>
            <p>Responder horário, confirmar presença, procurar conversa, conferir pagamento. O Lash Designer tira esse trabalho espalhado da sua cabeça e coloca num fluxo só.</p>
          </div>
          <div className="ld53-problem-grid">
            <article className="ld53-problem-item ld53-reveal">
              <figure data-parallax><img src="/landing/mobile-booking-1440.webp" alt="Cliente usando o celular em um studio de beleza" loading="lazy" /></figure>
              <span>01</span><h3>A cliente marca sem depender da sua resposta.</h3><p>Seu link mostra serviços, profissionais e horários. Se o catálogo for grande, a busca ajuda a encontrar o serviço.</p>
            </article>
            <article className="ld53-problem-item ld53-reveal">
              <figure data-parallax><img src="/landing/planning-1440.webp" alt="Profissional organizando o atendimento" loading="lazy" /></figure>
              <span>02</span><h3>Você não precisa lembrar de confirmar tudo.</h3><p>Com o WhatsApp do estúdio conectado, confirmações e lembretes acompanham os atendimentos da equipe.</p>
            </article>
            <article className="ld53-problem-item ld53-reveal">
              <figure data-parallax><img src="/landing/treatment-1440.webp" alt="Lash designer durante atendimento" loading="lazy" /></figure>
              <span>03</span><h3>Enquanto você atende, o negócio continua organizado.</h3><p>Horários, clientes, financeiro e pendências ficam legíveis quando você volta para o painel.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="ld53-system" id="como-funciona">
        <div className="ld53-shell">
          <div className="ld53-system-head ld53-reveal">
            <span className="ld53-kicker">Como o Lash Designer trabalha</span>
            <h2 className="ld54-section-title">Da primeira mensagem ao fechamento do dia, <em>tudo conversa.</em></h2>
            <p>Role a página e veja como o mesmo atendimento atravessa agendamento, WhatsApp e gestão sem você reconstruir o contexto.</p>
          </div>
          <div className="ld53-system-grid ld53-reveal">
            <div className="ld53-system-list" role="tablist" aria-label="Fluxos do Lash Designer">
              <button data-story-step type="button" role="tab" aria-selected={activeStory === 0} className={activeStory === 0 ? 'is-active' : ''} onClick={() => chooseStory(0)}><span>01</span><div><strong>Agendamento que começa pela cliente.</strong><p>A cliente escolhe serviço, profissional e horário. O atendimento entra na agenda da profissional, com disponibilidade por pessoa.</p></div><i>↗</i></button>
              <button data-story-step type="button" role="tab" aria-selected={activeStory === 1} className={activeStory === 1 ? 'is-active' : ''} onClick={() => chooseStory(1)}><span>02</span><div><strong>WhatsApp que acompanha o horário.</strong><p>Confirmações, lembretes e conversas ficam conectados ao atendimento, com nome e contexto.</p></div><i>↗</i></button>
              <button data-story-step type="button" role="tab" aria-selected={activeStory === 2} className={activeStory === 2 ? 'is-active' : ''} onClick={() => chooseStory(2)}><span>03</span><div><strong>Gestão que não depende de fechar o dia.</strong><p>Agenda, clientes, movimento financeiro e pendências ficam legíveis quando você abre o painel.</p></div><i>↗</i></button>
            </div>
            <div className="ld53-system-stage" aria-live="polite">
              {activeStory === 0 ? <div key="story-booking" className="ld53-system-panel is-active ld541-state-enter">
                <div className="ld53-system-photo"><img src="/landing/studio-1672.webp" alt="Studio de beleza" loading="lazy" /></div>
                <div className="ld53-system-booking"><img src="/landing/mobile-booking-720.webp" alt="Agendamento online no celular" loading="lazy" /><span><Globe size={15} /> Seu link. A agenda dela.</span></div>
                <div className="ld53-system-phone"><div className="ld53-phone"><img src="/landing/product/mobile-dashboard.webp" alt="Lash Designer no celular" loading="lazy" /></div></div>
                <div className="ld53-system-caption"><small>AGENDAMENTO ONLINE</small><strong>Ela escolhe sem esperar você responder.</strong></div>
              </div> : activeStory === 1 ? <div key="story-whatsapp" className="ld53-system-panel is-active ld541-state-enter">
                <div className="ld53-chat-demo">
                  <div className="ld53-chat-top"><span>Mariana • Lash Studio</span><small>online</small></div>
                  <div className="ld53-chat-day">amanhã</div>
                  <div className="ld53-chat-bubble is-system">Oi, Júlia! Seu horário de Volume Brasileiro está marcado para amanhã às 14h. Podemos confirmar?</div>
                  <div className="ld53-chat-bubble is-client">Sim, confirmado 💗</div>
                  <div className="ld53-chat-status"><Check size={14} /><span><strong>Horário confirmado</strong><small>A agenda foi atualizada.</small></span></div>
                </div>
                <div className="ld53-system-caption is-dark"><small>WHATSAPP + AGENDA</small><strong>O WhatsApp deixa de ser sua agenda improvisada.</strong></div>
              </div> : <div key="story-management" className="ld53-system-panel is-active ld541-state-enter">
                <div className="ld53-system-dashboard"><img src="/landing/product/dashboard.webp" alt="Visão geral do Lash Designer" loading="lazy" /></div>
                <div className="ld53-data-card ld53-data-card-a"><small>AGENDA</small><strong>próximos horários</strong><span>sem procurar no WhatsApp</span></div>
                <div className="ld53-data-card ld53-data-card-b"><small>FINANCEIRO</small><strong>movimento no mesmo lugar</strong><span>sem fechar conta de cabeça</span></div>
                <div className="ld53-system-caption"><small>VISÃO DO NEGÓCIO</small><strong>Seu dinheiro para de ser uma sensação.</strong></div>
              </div>}
            </div>
          </div>
        </div>
      </section>

      <section className="ld53-team" id="equipe">
        <div className="ld53-shell">
          <div className="ld53-team-head ld53-reveal"><span className="ld53-kicker">Do atendimento solo ao estúdio com equipe</span><h2 className="ld54-section-title">Cada profissional com sua agenda. <em>Você com a visão do estúdio.</em></h2><p>Uma estrutura para crescer sem misturar horários ou compartilhar a senha da administração.</p></div>
          <div className="ld53-team-grid ld53-reveal">
            <article><ShieldCheck size={24}/><h3>Você organiza o estúdio.</h3><p>Cadastre profissionais, vincule os serviços de cada uma e acompanhe agenda, clientes e financeiro. O WhatsApp fica sob sua administração.</p></article>
            <article><Calendar size={24}/><h3>A profissional cuida da própria agenda.</h3><p>Com acesso individual, ela consulta seus atendimentos e pode abrir chamados de suporte. Dados administrativos e agendas de outras pessoas ficam protegidos.</p></article>
            <article><Smartphone size={24}/><h3>A cliente escolhe pelo celular.</h3><p>Ela busca o serviço, escolhe a profissional ou qualquer disponível e encontra os horários para agendar pelo link do estúdio.</p></article>
          </div>
        </div>
      </section>

      <section className="ld53-luma" id="luma">
        <div className="ld53-shell ld53-luma-panel ld53-reveal">
          <div className="ld53-luma-copy">
            <span className="ld53-kicker ld53-kicker-light">E ainda tem a Luma</span>
            <h2>E quando você quiser entender <em>o que está acontecendo, é só perguntar.</em></h2>
            <p>A Luma lê os indicadores do seu espaço e devolve respostas simples sobre agenda, movimento e pontos de atenção. Sem montar relatório para conseguir uma resposta.</p>
            <div className="ld53-luma-prompts"><span>“Como foi meu mês?”</span><span>“Onde minha agenda está ociosa?”</span><span>“O que merece atenção agora?”</span></div>
            <small>Recurso opcional, com limites de uso exibidos no painel. Agenda e gestão continuam funcionando sem IA.</small>
          </div>
          <div className="ld53-luma-visual">
            <img className="ld53-luma-art" src="/ai/luma-editorial.webp" alt="Representação editorial da Luma" loading="lazy" />
            <div className="ld53-luma-answer"><Sparkles size={18} /><p><strong>Seu mês está mais concentrado nas quintas e sextas.</strong><span>Há espaço ocioso no início da semana que pode virar uma ação de retorno.</span></p></div>
          </div>
        </div>
      </section>

      <section className="ld53-index">
        <div className="ld53-shell">
          <div className="ld53-index-head ld53-reveal"><span className="ld53-kicker">Tudo no mesmo lugar</span><h2 className="ld54-section-title">Uma rotina inteira sem montar <em>um quebra-cabeça de ferramentas.</em></h2></div>
          <div className="ld53-index-grid ld53-reveal">
            <div><small>AGENDAMENTO</small><span><Calendar size={18} /> Agenda e horários</span><span><Globe size={18} /> Link de agendamento</span><span><Smartphone size={18} /> Experiência mobile</span></div>
            <div><small>RELACIONAMENTO</small><span><Users size={18} /> Clientes e histórico</span><span><MessageSquare size={18} /> WhatsApp Center</span><span><Check size={18} /> Confirmações e lembretes</span></div>
            <div><small>GESTÃO</small><span><Wallet size={18} /> Financeiro</span><span><BarChart3 size={18} /> Indicadores</span><span><Sparkles size={18} /> Luma</span></div>
            <div><small>SEU ESPAÇO</small><span><Globe size={18} /> Endereço próprio</span><span><Sparkles size={18} /> Identidade do studio</span><span><ShieldCheck size={18} /> Acessos individuais</span><span><MessageSquare size={18} /> Suporte por tickets</span></div>
          </div>
        </div>
      </section>

      <section className="ld53-pricing" id="preco">
        <div className="ld53-aurora ld53-aurora-price" aria-hidden="true" />
        <div className="ld53-shell">
          <div className="ld53-pricing-head ld53-reveal">
            <span className="ld53-kicker">Planos</span>
            <h2 className="ld54-section-title">Um plano para sua equipe. <em>Um valor por estúdio.</em></h2>
            <p>Agenda por profissional, acesso individual para a equipe e um WhatsApp do estúdio gerenciado pela administradora. O preço é mensal por estúdio, conforme a faixa de profissionais.</p>
          </div>
          <div className="ld541-plan-includes ld53-reveal">
            <strong>Tudo isso já vem incluso:</strong>
            <div><span><Check size={15} /> Agenda + link online</span><span><Check size={15} /> WhatsApp Center</span><span><Check size={15} /> Clientes e histórico</span><span><Check size={15} /> Financeiro</span><span><Check size={15} /> Luma</span><span><Check size={15} /> Seu espaço personalizado</span><span><Check size={15} /> Acessos individuais</span><span><Check size={15} /> Suporte na plataforma</span></div>
          </div>
          <div className="ld53-plan-grid ld53-reveal is-team">
            {teamPlans.map(plan => <article key={plan.code} className={plan.code === 'TEAM_6' ? 'is-featured' : ''}>
              <div className="ld53-plan-top"><span>{plan.label}</span>{plan.code === 'TEAM_6' ? <small>PARA EQUIPES EM CRESCIMENTO</small> : null}</div>
              <strong>{price(plan.amountCents)}<i>/mês</i></strong>
              <p>Até {plan.seats} profissionais no mesmo estúdio</p>
              <div className="ld541-plan-save is-neutral"><Check size={14} /> Agenda individual e WhatsApp do estúdio</div>
              <Cta className="ld53-plan-cta" location={`pricing-${plan.code.toLowerCase()}`} onClick={() => buyTeam(plan.code)}>Escolher esse plano <ArrowRight size={17} /></Cta>
            </article>)}
          </div>
          <div className="ld53-payment-note"><ShieldCheck size={18} /><span>{catalogLoading ? 'Valores mensais por estúdio. Confira as opções na contratação.' : checkoutAvailable ? 'Pagamento seguro via Appmax. Confira os meios disponíveis no checkout.' : 'Os planos estão atualizados. A contratação está temporariamente indisponível; tente novamente em instantes.'}</span></div>
        </div>
      </section>

      <section className="ld53-faq" id="duvidas">
        <div className="ld53-shell ld53-faq-grid">
          <div className="ld53-faq-head ld53-reveal"><span className="ld53-kicker">Sem letras miúdas</span><h2 className="ld54-section-title">As dúvidas que normalmente aparecem <em>antes de contratar.</em></h2></div>
          <div className="ld53-faq-list ld53-reveal">{[...faqItems, ['Quanto custa para a minha equipe?', teamPlans.map(plan => `${plan.label}: ${price(plan.amountCents)} por mês`).join('; ') + '. O valor é por estúdio, não por profissional.'], ['Como funciona o pagamento?', 'Os planos são mensais. O checkout Appmax apresenta o total e os meios disponíveis antes da confirmação. A liberação do acesso depende da confirmação do pagamento.']].map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>
        </div>
      </section>

      <section className="ld53-final">
        <div className="ld53-shell ld53-final-panel ld53-reveal">
          <div><span className="ld53-kicker ld53-kicker-light">Seu jeito de atender continua seu</span><h2>Organize o studio <em>sem mudar o que você faz de melhor.</em></h2><p>O Lash Designer entra na operação para você continuar entrando no atendimento.</p></div>
          <div><Cta className="ld53-btn ld53-btn-light ld53-btn-xl" location="final" onClick={() => buyTeam()}>Quero organizar meu estúdio <ArrowRight size={18} /></Cta><small>Sem taxa por agendamento.</small></div>
        </div>
      </section>
    </main>

    <footer className="ld53-footer">
      <div className="ld53-aurora ld53-aurora-footer" aria-hidden="true" />
      <div className="ld53-shell ld53-footer-card">
        <div className="ld53-footer-brand"><BrandWordmark inverse /><p>Da agenda individual à equipe de 15 profissionais: seu estúdio organizado em um só lugar.</p></div>
        <div className="ld53-footer-links"><div><strong>Produto</strong><a href="#como-funciona">Como funciona</a><a href="#produto">Produto</a><a href="#luma">Luma</a><a href="#preco">Planos</a></div><div><strong>Acesso</strong><a href="/login">Acessar meu espaço</a>{supportUrl ? <a href={supportUrl}>Suporte</a> : null}</div><div><strong>Legal</strong>{termsUrl ? <a href={termsUrl}>Termos</a> : null}{privacyUrl ? <a href={privacyUrl}>Privacidade</a> : null}</div></div>
        <div className="ld53-footer-bottom"><span>© {new Date().getFullYear()} Lash Designer.</span><small>Feito para a rotina real de quem trabalha com beleza.</small></div>
      </div>
    </footer>

    <LandingCheckout open={checkoutOpen} onClose={() => setCheckoutOpen(false)} referralToken={referralToken || undefined} initialTeamPlan={checkoutTeamCode} />
  </div>
}

export function WorkspaceAccessPage() {
  const [slug, setSlug] = useState('')
  const [error, setError] = useState('')
  const supportUrl = String(import.meta.env.VITE_SUPPORT_URL ?? import.meta.env.VITE_SALES_URL ?? '').trim()
  const workspaceDomain = (() => {
    const configured = String(import.meta.env.VITE_APP_BASE_URL ?? '').trim()
    try { return new URL(configured || window.location.origin).hostname.replace(/^www\./, '') }
    catch { return 'lashdesigner.space' }
  })()

  useEffect(() => {
    document.body.classList.add('landing-body')
    document.title = 'Acessar meu espaço — Lash Designer'
    return () => document.body.classList.remove('landing-body')
  }, [])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const normalized = slug.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[./]/)[0]
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)) {
      setError('Digite somente o endereço curto do seu espaço, por exemplo: studio-aurora.')
      return
    }
    window.location.assign(workspaceLoginUrl(normalized))
  }

  return <main className="landing-access-page">
    <div className="landing-access-background" />
    <section className="landing-access-card">
      <aside className="landing-access-aside">
        <a href="/" aria-label="Voltar para Lash Designer"><BrandWordmark inverse /></a>
        <div><span>Seu negócio continua aqui</span><h2>Agenda, clientes e financeiro no mesmo espaço.</h2><p>Entre no endereço exclusivo da sua marca para continuar.</p></div>
        <img src="/landing/product/dashboard.webp" alt="Visão do painel Lash Designer" />
      </aside>
      <div className="landing-access-content">
        <a href="/" className="landing-access-mobile-brand"><BrandWordmark /></a>
        <span className="landing-kicker">Área da profissional</span>
        <h1>Entre no seu espaço.</h1>
        <p>Informe o endereço curto que você escolheu ao criar sua conta.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="workspace-slug">Seu endereço</label>
          <div className="landing-access-slug"><input id="workspace-slug" value={slug} onChange={(event) => { setSlug(event.target.value); setError('') }} placeholder="studio-aurora" autoComplete="organization" autoFocus /><span>.{workspaceDomain}</span></div>
          {error ? <div className="landing-access-error">{error}</div> : null}
          <button className="landing-access-submit" type="submit">Acessar meu espaço <ArrowRight size={16} /></button>
        </form>
        <div className="landing-access-help"><ShieldCheck size={18} /><span><strong>Ambiente exclusivo e seguro</strong><small>Cada negócio acessa seus dados em um endereço separado.</small></span></div>
        {supportUrl ? <a className="landing-access-support" href={supportUrl}>Esqueci meu endereço — falar com o suporte</a> : null}
      </div>
    </section>
  </main>
}
