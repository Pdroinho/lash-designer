# Lash Designer 3.0.0 RC — Maison Appointment

## Direção

O booking público foi reconstruído visualmente a partir da premissa **luxury editorial beauty + produto digital contemporâneo**. A versão 3.0 não reaproveita a composição visual 2.8/2.9: preserva apenas a lógica funcional e substitui a direção de arte por um sistema próprio.

### O que foi removido
- rail vinho promocional;
- fotografia ocupando metade da tela;
- card flutuante sobre fotografia;
- gradientes decorativos;
- SVGs/ornamentos abstratos;
- stepper em barras genéricas;
- duplicação do resumo em várias superfícies;
- altura artificial de dashboard.

### Novo contrato visual
- cabeçalho horizontal com marca e jornada 01–04;
- tipografia editorial com Fraunces apenas nos momentos de maior hierarquia;
- conteúdo principal assimétrico com área de decisão ampla;
- `dossier` de reserva claro e contextual, sem competir com o formulário;
- fotografia usada somente como evidência do serviço;
- serviços apresentados como galeria compacta, sem cards SaaS ornamentais;
- confirmação desktop sem review duplicado;
- confirmação mobile com resumo condensado;
- CTA contextual (`Reservar às HH:MM`);
- consentimento promocional preservado de forma discreta;
- mobile desenhado como composição própria.

## Funcionalidade preservada
- normalização/máscara do WhatsApp local, `55` e `+55`;
- criação pública apenas com nome + WhatsApp;
- consentimento de marketing opcional e desmarcado por padrão;
- trilha de consentimento e opt-out posterior;
- disponibilidade, serviços, datas e horários existentes;
- fluxo passwordless da cliente;
- segurança, billing, Luma, indicações e setup fora do booking não foram redesenhados.

## QA executado neste ambiente
- 12/12 cenários visuais dedicados sem overflow/clipping estrutural: serviços, confirmação e disclosure de consentimento em 1440×900, 1024×768, 390×844 e 320×568;
- 25/25 auditoria de experiência pública;
- 15/15 auditoria de consentimento;
- 26/26 responsividade;
- 22/22 sistema visual;
- 18/18 UX/overlays;
- 16/16 iconografia;
- 12/12 indicações;
- 16/16 onboarding;
- 26/26 estrutural 2.4;
- 12/12 Luma;
- 25 arquivos TS/TSX de `src/` sem erro sintático no parser TypeScript;
- `booking-v30.css`: chaves balanceadas e zero `!important`.

## Gate externo
`npm ci --ignore-scripts` continua bloqueado pelo registry interno do ambiente, que retorna 404 para `zod-validation-error@4.0.2`. Por isso a entrega permanece RC até `npm ci && npm run check && npm run preflight` ser executado em VPS/CI com registry funcional e variáveis de produção.
