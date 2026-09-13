# Lash Designer 5.4.0 — Motion-Directed Landing

## Motivo

A 5.3 corrigiu a estrutura comercial, mas a landing ainda dependia de headline grande, gradiente e reveals genéricos para produzir impacto. A 5.4 reduz a escala tipográfica e introduz uma coreografia profissional de produto usando GSAP.

## Stack

Nova dependência de runtime:

- `gsap@3.15.0`

Plugins usados a partir do pacote:

- ScrollTrigger;
- SplitText.

Nenhum Tailwind, Magic UI, Aceternity, React Bits ou Motion foi adicionado. O projeto continua usando seu CSS atual como fonte de layout/branding.

## Hero

- headline com teto de aproximadamente 66 px no desktop;
- supporting copy orientada à rotina real;
- mesh gradient com glows e grain;
- entrada do texto por palavras usando SplitText;
- produto recebe entrada própria e movimento ligado ao scroll;
- side peeks ganham profundidade via scrub.

## Scroll e produto

- headlines de seção entram por linhas mascaradas;
- bloco Agendamento / WhatsApp / Gestão vira scroll story no desktop;
- o painel visual permanece sticky enquanto os passos avançam;
- fotografias recebem parallax leve;
- CTAs usam interação magnética;
- transições de estados do produto são coordenadas por GSAP.

## Acessibilidade

`prefers-reduced-motion` desativa movimento não essencial. No tablet/mobile, a scroll story deixa de depender de sticky/scrub e mantém controles tocáveis.

## Prova social

A página continua sem depoimentos, ratings ou números inventados.

## Gates

- Landing 5.4: 22/22;
- Responsividade: 26/26;
- Iconografia: 16/16;
- Visual: 22/22;
- Design System: aprovado;
- UX: 18/18;
- Onboarding: 16/16;
- Estrutural: 26/26;
- Luma: 33/33;
- Financeiro: 24/24;
- Agenda: 36/36;
- WhatsApp: 25/25;
- Consistência: 19/19;
- Customer Experience: 25/25;
- Consentimento: 15/15;
- Security 5.x: 43/43;
- Password UI: 11/11;
- testes executáveis independentes: 53/53;
- audit offline: 0 vulnerabilidades reportadas.

## Antes de promover

Este ambiente não possui `node_modules` íntegro e não conseguiu baixar GSAP. O typecheck para em `vite/client` ausente. Na VPS/CI:

```bash
npm ci
npm run check
set -a; source ./.env; set +a
NODE_ENV=production npm run preflight
```

Depois do build, fazer QA visual desktop/tablet/mobile da landing 5.4, incluindo `prefers-reduced-motion`.
