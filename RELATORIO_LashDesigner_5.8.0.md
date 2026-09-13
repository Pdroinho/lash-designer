# Relatório técnico — Lash Designer 5.8.0

Release: `5.8.0`
Escopo: landing page comercial.

## Entregue
- Landing reconstruída em `src/LandingPage.tsx`.
- Nova camada visual `src/landing-v58.css`.
- Phosphor Icons como única fonte de iconografia da landing.
- Nova direção dark editorial com produto em primeiro plano.
- Hero, pilares fotográficos, showcase, diretório de capacidades, seção operacional, pricing, FAQ, CTA final e footer refeitos.
- Pricing dinâmico continua consumindo `/api/public/billing/plans` e envia o ciclo escolhido para `LandingCheckout`.
- Termos, Privacidade, referral e retorno de workspace preservados.
- Novo audit `scripts/landing-v58-audit.mjs`.
- QA visual `scripts/landing-v58-visual-qa.py`.

## Validação
- Landing 5.8: 22/22.
- QA visual: 4/4 viewports, sem overflow horizontal/clipping estrutural.
- Responsive: 26/26.
- Icons: 16/16.
- Visual System: 22/22.
- UX: 18/18.
- Referrals: 12/12.
- Onboarding: 16/16.
- Structural: 26/26.
- Luma: 33/33.
- Finance: 24/24.
- Appointment lifecycle: 36/36.
- WhatsApp: 26/26.
- Consistency: 19/19.
- Customer Experience: 25/25.
- Marketing Consent: 16/16.
- Security: 43/43.
- Password UI: 11/11.
- Legal/Compliance: 38/38.
- Asset Refresh: 30/30.
- Suites executáveis: migrations 14/14 + security primitives 11/11 + WhatsApp/campaigns 35/35 = 60/60.
- `npm audit --omit=dev --offline`: 0 vulnerabilidades reportadas.
- TSX transpile diagnostics: 0.

## Limitação do ambiente
`npm ci --offline` não conclui por cache ausente do GSAP e `npm run typecheck` para em `vite/client` porque `node_modules` não está instalado. Build/typecheck completos continuam obrigatórios no VPS/CI.
