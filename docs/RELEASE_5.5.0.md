# Lash Designer 5.5.0 — Component-Led Landing Refinement

## Motivo da release

A 5.4 elevou a direção visual, mas deixou problemas funcionais e de composição perceptíveis em produção:

- títulos com acentos/descendentes cortados por máscaras de SplitText;
- showcase de produto e fluxo operacional podiam ficar visualmente presos no último estado porque GSAP deixava estilos inline de `opacity/visibility`;
- o bloco “Feito para a rotina real” não justificava o espaço ocupado;
- Luma usava direção de arte genérica de IA em vez de demonstrar o produto;
- diretório “Tudo no mesmo lugar” era correto, mas visualmente indiferente;
- preços não explicavam com força a promoção, a economia e o que está incluído;
- GSAP estava assumindo responsabilidades de state/UI que pertencem ao React.

## Decisões

### React Bits / Magic Bento

O bloco de benefícios passa a usar uma implementação adaptada do padrão **Magic Bento** do React Bits, que é distribuído como componente copy-paste e possui variante TS + CSS. A integração usa o stack já existente (React + GSAP + CSS), sem introduzir Tailwind apenas para a landing.

Foram preservados os efeitos que agregam ao produto:

- spotlight/border glow seguindo o cursor;
- tilt muito leve;
- desativação em coarse pointer/mobile/reduced-motion.

Partículas, magnetismo agressivo e ripple decorativo foram deliberadamente omitidos.

### GSAP

GSAP continua instalado, mas deixa de ser responsável por troca de tabs/carousels e visibilidade de estados.

Ele fica restrito a:

- entrada inicial do hero;
- reveal tipográfico/sections;
- parallax muito leve em um elemento Bento no desktop.

### Carousels / estados

Produto e “Como funciona” agora usam React como única fonte de verdade:

- só o estado ativo é montado;
- o próximo estado usa módulo e volta ao primeiro;
- interação manual pausa a rotação por 9 s;
- auto-rotação só acontece quando a seção está dentro do viewport;
- nenhum painel antigo pode permanecer por cima devido a inline styles de GSAP.

### Títulos

SplitText não usa mais `mask`. CSS também explicita `overflow: visible` para linhas, palavras e headings. Isso elimina clipping de acentos e descendentes em português.

### Luma

A arte editorial abstrata foi removida da landing. A seção agora demonstra uma conversa real de produto:

- três perguntas interativas;
- resposta contextual de demonstração;
- fontes de contexto Agenda / Clientes / Indicadores;
- aviso claro de que os dados reais vêm do espaço da profissional.

### Pricing

Todos os planos continuam liberando o mesmo produto. A apresentação agora destaca:

- benefícios inclusos em qualquer ciclo;
- promoção de entrada do mensal (R$ 39,90 no primeiro mês);
- preço mensal equivalente;
- total cobrado no ciclo;
- economia nominal comparada ao mensal;
- anual como maior economia, sem esconder os demais ciclos.

## QA

- Landing 5.5 audit: 23/23;
- QA visual fixture: 390×844, 768×900, 1366×900 e 1920×1080 sem overflow horizontal/clipping de heading;
- Responsividade: 26/26;
- Iconografia: 16/16;
- Visual System: 22/22;
- Design System 3.3: aprovado;
- UX: 18/18;
- Product Consistency: 19/19;
- Customer Experience: 25/25;
- Security 5.x: 43/43;
- Password UI: 11/11;
- Referrals: 12/12;
- Onboarding: 16/16;
- Estrutural: 26/26;
- Luma: 33/33;
- Financeiro: 24/24;
- Appointment Lifecycle: 36/36;
- WhatsApp: 25/25;
- Consentimento: 15/15;
- testes executáveis de migrations/security/WhatsApp: 53/53;
- `npm install --package-lock-only --offline`: 472 pacotes auditados, 0 vulnerabilidades reportadas.

## Gate não executado neste ambiente

`npm ci --ignore-scripts --offline` continua bloqueado por `zod-validation-error@4.0.2` ausente no cache npm local. Portanto typecheck/build integral permanece obrigatório no ambiente real antes do deploy.
