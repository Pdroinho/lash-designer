# Relatório — Lash Designer 5.7.0

Release focado exclusivamente em coerência visual dos assets de marketing/produto.

## Entregue

- fixture canônico atualizado para a cascata visual corrente;
- novos screenshots de Dashboard, Agenda, Luma, WhatsApp, Financeiro, Booking e mobile;
- vídeos de showcase regenerados;
- OG cover atualizado;
- limpeza de assets legados e demonstrativos sem uso;
- manifests e catálogo atualizados;
- gate `test:assets57`.

## Tipografia

A causa da divergência foi confirmada: fixture antigo + assets congelados + diferença de disponibilidade de fonte. A aplicação continua canonicamente em Manrope. Este ambiente de build não tem Manrope instalada e não acessa Google Fonts, portanto as prévias rasterizadas desta sessão usam Inter, que é o fallback real da cadeia. O novo pipeline possui modo estrito para impedir publicação futura de captura sem Manrope.

## Segurança / backend

Nenhuma regra de negócio, schema, autenticação, pagamentos, WhatsApp runtime ou compliance da 5.6 foi alterado por este refresh.

## Validação executada nesta sessão

- Asset Refresh 5.7: 30/30;
- Landing corrective: 19/19;
- Legal/compliance: 38/38;
- Responsividade: 26/26;
- Iconografia: 16/16;
- Visual system: 22/22;
- UX: 18/18;
- Onboarding: 16/16;
- Luma: 33/33;
- Financeiro: 24/24;
- Appointment lifecycle: 36/36;
- WhatsApp Center: 26/26;
- Consistência: 19/19;
- Customer experience: 25/25;
- Marketing consent: 16/16;
- Security: 43/43;
- Password UI: 11/11;
- testes independentes de migrations/security/WhatsApp: 60/60;
- `npm audit --omit=dev --offline`: 0 vulnerabilidades reportadas.

`npm run typecheck` continua indisponível neste ambiente por ausência de `node_modules`/`vite/client`; o gate integral permanece obrigatório no VPS/CI.
