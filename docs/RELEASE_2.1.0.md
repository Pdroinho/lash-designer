# Release 2.1.0 — Brand, Tour & UX Recovery

## Objetivo

Corrigir regressões de hierarquia observadas depois do rebuild 2.0 e consolidar uma base visual verificável: onboarding nunca concorre com cobrança, diálogos possuem comportamento previsível, o console DEV tem dark mode utilizável e a iconografia volta a usar uma família profissional.

## Entregas

- Phosphor Icons 2.1.10 fixado no manifesto, por imports modulares, exports `Icon` atuais e mapa semântico;
- remoção completa de `BrandIcons.tsx` e dos SVGs próprios rejeitados;
- navegação com peso `regular`/`duotone` por estado;
- Manrope para interface e Fraunces para momentos editoriais;
- normalização das fontes legadas da landing e do financeiro;
- dark mode DEV reconstruído em carvão quente, com vinho padrão visível e tokens de status próprios;
- tema DEV claro por padrão e isolado da preferência global antiga;
- tokens semânticos de sucesso, aviso, erro, informação e estado neutro em claro/escuro;
- Product Tour desabilitado para tenants sem assinatura e para a aba de billing;
- Product Tour abaixo de modais, fechado por overlays e impedido de roubar foco de diálogos;
- compatibilidade com tours já concluídos nas versões anteriores, sem reaparecimento indevido;
- abertura manual do tour fecha drawer e notificações concorrentes;
- scroll lock independente para tour, modal e drawer, sem corrida ao trocar de camada;
- `OverlayCoordinator` com foco, Escape, Tab, overlays empilhados, scroll locks independentes e restauração de foco;
- dez superfícies modais com semântica de diálogo;
- ações de cancelar incorporadas ao contrato global de Escape;
- modal de novo espaço com fechamento, slug/sufixo separados, limpeza de rascunho, proteção durante envio e layout mobile;
- CTA comercial sem dependência de WhatsApp para pagamento e com proteção de links externos;
- `.env.example` restaurado e atualizado para billing por ciclo e Luma;
- nova camada final `design-system.css`;
- auditorias automatizadas de iconografia, visual, responsividade e UX;
- matriz manual obrigatória de perfis, estados e viewports;
- roadmap de assets reais 2.2.

## Decisão de arquitetura

O release não volta à biblioteca anterior nem mantém duas famílias concorrentes. As telas importam significados de `src/components/Icons.ts`, que aponta para glyphs Phosphor individuais. Isso permite trocar um desenho sem espalhar nomes de biblioteca por todo o produto.

O Product Tour é tratado como educação opcional. Pagamento, autenticação, confirmação e ações destrutivas têm prioridade absoluta.

## Limitações e homologação

O build completo depende de `npm ci` em um ambiente com acesso normal ao registro npm. Auditorias estáticas não substituem inspeção visual. Antes de publicar, execute `npm run check`, o preflight e toda a matriz de `docs/VISUAL_QA_MATRIX_2.1.md` em staging com dados reais.
