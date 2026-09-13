# 5.10.2 — Mobile App Foundation · Parte 3

- Financeiro, Luma e Assinatura migrados para composição mobile-app.
- Mobile Part 3 audit: 18/18.
- QA visual: 12/12 em 390/430/768 sem overflow horizontal.
- Testes independentes: 60/60.
- Typecheck integral não executável sem node_modules/vite/client neste ambiente.

# Validação 5.10.1 — Mobile App Foundation · Parte 2

- Mobile App Parte 1: **22/22**.
- Mobile App Parte 2: **18/18**.
- Responsividade: **26/26**.
- Visual System: **22/22**.
- Product Consistency: **19/19**.
- WhatsApp Center: **26/26**.
- Tenant Theme: **20/20**.
- Security 5.x: **43/43**.
- Testes independentes migrations/security/WhatsApp: **60/60**.
- QA visual fixture Parte 2: **12/12** (390, 430 e 768 px × Clientes/Serviços/WhatsApp inbox/chat), sem overflow horizontal.
- Transpile TSX isolado de `App.tsx` e `WhatsAppCenter.tsx`: **0 erros de sintaxe**.
- `npm audit --omit=dev --offline`: **0 vulnerabilidades reportadas**.
- `tsc -p tsconfig.json --noEmit`: bloqueado por `vite/client` ausente neste ambiente.

---

# Validação 5.10.0 — Mobile App Foundation · Parte 1

- Mobile App audit: **22/22**.
- Responsividade: **26/26**.
- Visual System: **22/22**.
- Product Consistency: **19/19**.
- Tenant Theme: **20/20**.
- Appointment Lifecycle: **36/36**.
- Security 5.x: **43/43**.
- TSX transpile isolado: **0 diagnósticos de sintaxe**.
- QA visual fixture: **9/9** (390, 430 e 768 px × Dashboard/Agenda semana/Agenda mês), sem overflow horizontal.
- `tsc -p tsconfig.json --noEmit`: bloqueado por `vite/client` ausente neste ambiente.

---

# Validação 5.9.0 — Tenant Theme Coherence

- Tenant Theme audit: **20/20**.
- Responsividade: **26/26**.
- Visual System: **22/22**.
- Onboarding: **16/16**.
- Product Consistency: **19/19**.
- Security 5.x: **43/43**.
- Testes independentes migrations/security/WhatsApp: **60/60**.
- `tsc -p tsconfig.json --noEmit`: bloqueado neste ambiente por ausência de `vite/client`.
- QA visual Chromium local não foi declarado: o runtime desta sessão bloqueou navegação local/file do browser.

---

# Validação 5.8.0 — Landing dark editorial

- Landing audit: 22/22
- QA visual: 390, 768, 1440 e 1920 px; zero overflow horizontal e zero heading clipped
- Matriz estática de produto: verde
- Suites executáveis: 60/60
- npm audit --omit=dev --offline: 0 vulnerabilidades reportadas
- TSX transpile diagnostics: 0
- typecheck/build integral: não executado por ausência de node_modules/vite/client neste ambiente

# Validação 5.7.0 — Asset Refresh

- `node scripts/asset-refresh-v57-audit.mjs` → 30/30.
- Screenshots regenerados: dashboard 1440×900, agenda 1440×900, Luma 1440×900, WhatsApp 1440×900, financeiro 1440×900, mobile dashboard 390×844 e booking 390×844.
- Vídeo: MP4/WebM 1280×800, 8s.
- OG: 1200×630.
- Assets legados sem uso removidos; fallback `result-640.webp` preservado.
- Fonte canônica: Manrope. O ambiente atual só consegue renderizar o fallback Inter; captura estrita com Manrope é exigível por `ASSET_CAPTURE_STRICT_FONT=1`.
- Asset Refresh: 30/30; Landing corrective: 19/19; Legal/compliance: 38/38.
- Testes independentes migrations/security/WhatsApp: 60/60.
- `npm audit --omit=dev --offline`: 0 vulnerabilidades reportadas.
- `npm run typecheck`: bloqueado neste ambiente por ausência de `vite/client`/`node_modules`; executar no VPS/CI.

---

# Validação 5.6.0 — Legal Compliance & Promotional Campaigns

## Executado

- Legal/compliance: **38/38**;
- Responsividade: **26/26**;
- Iconografia: **16/16**;
- Visual System: **22/22**;
- Design System 3.3: **aprovado**;
- UX: **18/18**;
- Indicações: **12/12**;
- Onboarding: **16/16**;
- Estrutural: **26/26**;
- Luma: **33/33**;
- Financeiro: **24/24**;
- Appointment Lifecycle: **36/36**;
- WhatsApp Center: **26/26**;
- Product Consistency: **19/19**;
- Customer Experience: **25/25**;
- Marketing Consent: **16/16**;
- Security 5.x: **43/43**;
- Password UI: **11/11**;
- Landing 5.4.1 baseline: **19/19**;
- migrations: **14/14**;
- security primitives: **11/11**;
- WhatsApp executável, incluindo helpers de campanha: **35/35**;
- grupos executáveis independentes: **60/60**;
- `npm audit --omit=dev --offline`: **0 vulnerabilidades reportadas**.

## Validação adicional

Os arquivos TS/TSX alterados foram transpilados isoladamente com TypeScript 5.8.3 sem diagnóstico de sintaxe.

## Gate integral bloqueado pelo ambiente

`npm run typecheck` foi tentado e interrompeu em `TS2688: Cannot find type definition file for 'vite/client'`, pois `node_modules` não está instalado. Não são declarados como aprovados neste ambiente `npm ci`, typecheck semântico integral, lint, suite que depende de `tsx`, build, `npm run check` completo e preflight com segredos reais.

---

# Validação 5.4.1 — Landing Corrective

## Executado

- Landing 5.4: 22/22;
- Responsividade: 26/26;
- Iconografia: 16/16;
- Visual System: 22/22;
- Design System 3.3: aprovado;
- UX: 18/18;
- Indicações: 12/12;
- Onboarding: 16/16;
- Estrutural: 26/26;
- Luma: 33/33;
- Financeiro: 24/24;
- Appointment Lifecycle: 36/36;
- WhatsApp Center: 25/25;
- Product Consistency: 19/19;
- Customer Experience: 25/25;
- Marketing Consent: 15/15;
- Security 5.x: 43/43;
- Password UI: 11/11;
- testes executáveis independentes: 53/53;
- `npm audit --omit=dev --offline`: 0 vulnerabilidades reportadas.

## Não executado nesta sessão

`npm run typecheck` interrompe em `vite/client` ausente porque `node_modules` não está instalado. O pacote GSAP também não pôde ser baixado sem rede. Build, lint/check integral, preflight e QA visual renderizado da 5.4 permanecem gates do ambiente de deploy.

---

# Validação 5.3.0 — Sales-first Landing Rebuild

## Gates executados neste ambiente

- Landing 5.3: **27/27**;
- QA visual full-page: **4/4 viewports** sem overflow horizontal (390 × 844, 768 × 900, 1440 × 900, 1920 × 1080);
- estados interativos de Agendamento / WhatsApp / Gestão verificados em desktop e mobile;
- migrations/security/WhatsApp independentes da árvore npm: **53/53 PASS**;
- Security 5.x: **43/43**;
- Appointment Lifecycle: **36/36**;
- WhatsApp Center: **25/25**;
- Product Consistency: **19/19**;
- Customer Experience: **25/25**;
- Marketing Consent: **15/15**;
- Responsividade: **26/26**;
- Iconografia: **16/16**;
- Visual System: **22/22**;
- Design System 3.3: **aprovado, dívida visual não aumentou**;
- UX: **18/18**;
- Indicações: **12/12**;
- Onboarding: **16/16**;
- Estrutural: **26/26**;
- Luma: **33/33**;
- Financeiro: **24/24**;
- Password UI: **11/11**;
- `npm audit --omit=dev --offline`: **0 vulnerabilidades reportadas**.

## Falhas encontradas pelos próprios gates

- `id="como-funciona"` estava duplicado durante a reconstrução e foi corrigido;
- a consolidação das antigas seções havia removido acidentalmente estilos do mock de conversa do WhatsApp; o QA dos três estados detectou e a UI foi corrigida;
- o audit 5.3 ainda buscava a copy intermediária do hero e foi atualizado para verificar a promessa comercial final sem relaxar o contrato.

## Gate integral bloqueado pelo ambiente

A árvore npm desta sessão ficou incompleta. Não são declarados como executados/aprovados aqui `npm run typecheck`, `npm run lint`, `npm test` completo via `tsx`, `npm run build`, `npm run check` integral nem `NODE_ENV=production npm run preflight`. O pacote final remove o `node_modules` parcial.

---

# Validação 5.2.0 — Landing Rebuild

## Gates executados neste ambiente

- Landing 5.2: **24/24**;
- QA visual dedicado: **4/4 viewports** sem overflow horizontal do documento (390 × 844, 768 × 900, 1366 × 900, 1920 × 1080);
- migrations/security/WhatsApp independentes da árvore npm: **53/53 PASS**;
- Security 5.x: **43/43**;
- Appointment Lifecycle: **36/36**;
- WhatsApp Center: **25/25**;
- Product Consistency: **19/19**;
- Customer Experience: **25/25**;
- Marketing Consent: **15/15**;
- Responsividade: **26/26**;
- Iconografia: **16/16**;
- Visual System: **22/22**;
- Design System 3.3: **aprovado, dívida visual não aumentou**;
- UX: **18/18**;
- Indicações: **12/12**;
- Onboarding: **16/16**;
- Estrutural: **26/26**;
- Luma: **33/33**;
- Financeiro: **24/24**;
- Password UI: **11/11**.

## Gate integral bloqueado pelo ambiente

`npm run typecheck` para em `TS2688: Cannot find type definition file for 'vite/client'` porque a árvore npm não está instalada nesta sessão. Por isso não são declarados como executados/aprovados aqui `npm run check`, build e preflight integrais. O pipeline padrão deve rodar no ambiente de deploy antes da promoção.

---

# Validação 5.1.1 — Password Guidance + base 5.1

## Gates executados neste ambiente

- migrations/primitives/WhatsApp independentes da árvore npm completa: **50/50 PASS**;
- Security 5.1: **43/43**;
- Appointment Lifecycle: **36/36**;
- WhatsApp Center: **25/25**;
- Product Consistency: **19/19**;
- Customer Experience: **25/25**;
- Marketing Consent: **15/15**;
- Responsividade: **26/26**;
- Iconografia: **16/16**;
- Visual System: **22/22**;
- Design System 3.3: **aprovado, dívida visual não aumentou**;
- UX: **18/18**;
- Indicações: **12/12**;
- Onboarding: **16/16**;
- Estrutural: **26/26**;
- Luma: **33/33**;
- Financeiro: **24/24**.

O lockfile 5.1 foi reconciliado com `npm install --package-lock-only --ignore-scripts --offline`; a execução concluiu, auditou **471 pacotes** e reportou **0 vulnerabilidades conhecidas** pelo metadata disponível.

## Regressões/erros detectados durante a própria validação

- o trusted device já tinha TTL de 365 dias no registro do banco, mas o cookie ainda expirava em 30 dias; ambos agora usam `TRUSTED_DEVICE_TTL_MS`;
- o QR da Evolution Global reutilizava CSS privado do módulo `.wa39`, cujos tokens eram escopados; o painel DEV agora usa componentes/tokens globais;
- uma inconsistência herdada da 5.0 fazia revogações de sessão/dispositivo prosseguirem sem aguardar a confirmação assíncrona; as ações agora aguardam o modal corretamente;
- o reenvio de OTP profissional ganhou limiter persistente e challenge-scoped para evitar spam após a troca de TOTP por WhatsApp.

## Gate integral bloqueado pelo ambiente

`npm ci --ignore-scripts --offline` falha com `ENOTCACHED` porque o cache local não contém `zod-validation-error@4.0.2`. Qualquer `node_modules` parcial foi removido.

Por isso **não são declarados como executados/aprovados** neste ambiente:

- `npm ci` completo;
- `npm run typecheck` completo;
- `npm run lint` completo;
- `npm test` completo via `tsx`;
- `npm run build`;
- `npm run check` integral;
- `npm run preflight` com build/secrets/infra reais.

A promoção da 5.1 exige esses gates em CI/VPS com registry funcional, além de fresh/upgrade DB, backup/restore e homologação real de WhatsApp OTP, Evolution Global, CLIENT OTP, InfinitePay e TLS.

---

# Validação 5.0.0 RC — Production Security & Reliability

## Gates executados neste ambiente

- primitives/migrations/WhatsApp independentes da árvore npm completa: **50/50 PASS**;
- Security 5.0: **29/29**;
- Appointment Lifecycle: **36/36**;
- WhatsApp Center: **25/25**;
- Product Consistency: **19/19**;
- Customer Experience: **25/25**;
- Marketing Consent: **15/15**;
- Responsividade: **26/26**;
- Iconografia: **16/16**;
- Visual System: **22/22**;
- Design System 3.3: **aprovado, dívida visual não aumentou**;
- UX: **18/18**;
- Indicações: **12/12**;
- Onboarding: **16/16**;
- Estrutural: **26/26**;
- Luma: **33/33**;
- Financeiro: **24/24**.

O lockfile 5.0 foi reconciliado com `npm install --package-lock-only --ignore-scripts --offline`; a execução concluiu e reportou **0 vulnerabilidades conhecidas** na árvore registrada.

## Correções encontradas pelos próprios gates durante a implementação

- regex inválida na rota de mídia detectada pelo TypeScript parcial e corrigida;
- inicialização incorreta de `APP_ENCRYPTION_KEY` detectada antes do fechamento e corrigida;
- 2 novos raios + 3 cores locais detectados pelo Design System e substituídos por valores/tokens existentes;
- audit antigo de Agenda exigia seleção automática do “pedido mais recente”; foi substituído por contrato mais seguro de desambiguação, sem alterar o audit para aceitar comportamento mais fraco;
- audits antigos de Consistência/Customer ainda estavam hardcoded em `4.0.0`/cookie JWT; foram atualizados para verificar coerência do lockfile e sessão server-side.

## Gate integral bloqueado pelo ambiente

`npm ci --ignore-scripts --offline` não pôde materializar a árvore completa porque o cache não contém `zod-validation-error@4.0.2`; acesso ao registry externo também não ficou disponível de forma confiável. Por isso **não são declarados como executados/aprovados** neste ambiente:

- `npm ci` completo;
- `npm run typecheck` completo;
- `npm run lint` completo;
- `npm test` completo via `tsx`;
- `npm run build`;
- `npm run check` integral;
- `npm run preflight` com secrets/build reais.

A promoção da 5.0 exige esses gates em CI/VPS com registry funcional, além de fresh DB, upgrade de banco legado real, backup/restore e homologação real de Evolution, InfinitePay, Caddy/TLS e browsers/dispositivos.

---

# Validação 3.0.0

- 12/12 cenários dedicados de booking sem overflow/clipping estrutural.
- 25/25 experiência pública.
- 15/15 consentimento.
- 26/26 responsividade.
- 22/22 sistema visual.
- 18/18 UX/overlays.
- 16/16 iconografia.
- 12/12 indicações.
- 16/16 onboarding.
- 26/26 estrutural.
- 12/12 Luma.
- 25 arquivos `src/*.ts(x)` analisados sem erro sintático.
- `npm ci --ignore-scripts`: bloqueado externamente por 404 do registry interno em `zod-validation-error@4.0.2`.
- `preflight` sem ambiente de produção: esperado falhar por ausência de secrets/build/variáveis obrigatórias.

# Validação 2.9.0

- matriz Chromium dedicada do booking: **30/30 PASS**, cobrindo 320×568, 360×800, 390×844, 412×915, 768×900, 1024×768, 1280×800, 1440×900 e 1920×1080;
- inclui as quatro etapas, confirmação com `+55` e disclosure `Ler mais`;
- detector adicional de clipping interno não encontrou containers com `scrollWidth > clientWidth`;
- detector de texto espremido não encontrou blocos importantes com largura anormal;
- `customer-experience-audit`: **25/25**;
- `marketing-consent-audit`: **15/15**;
- `responsive-audit`: **26/26**;
- `visual-system-audit`: **22/22**;
- `ux-audit`: **18/18**;
- `iconography-audit`: **16/16**;
- `luma-experience-audit`: **12/12**;
- `referral-audit`: **12/12**;
- `onboarding-audit`: **16/16**;
- `v24-structural-audit`: **26/26**;
- **49/49** arquivos TS/TSX de runtime passaram em transpilação sintática isolada.

O build integral segue como gate externo: a tentativa de `npm ci --ignore-scripts` recebeu `404` do registry interno para `zod-validation-error@4.0.2`. Em CI/VPS com registry funcional continuam obrigatórios `npm ci`, `npm run check` e `npm run preflight`.

---

# Validação 2.8.0

A release 2.8.0 passou na matriz visual Chromium 35/35, nas auditorias responsiva, iconografia, sistema visual, UX, indicações, onboarding, estrutural, Luma, experiência pública e consentimento. A transpilação sintática isolada de 34 arquivos TS/TSX de runtime não encontrou diagnóstico. O build integral permanece externo porque `npm ci` recebe 404 do registry interno para `zod-validation-error@4.0.2`.

# Validação da entrega 2.7.0

## Consentimento promocional

- `marketing-consent-audit`: **15/15**;
- `customer-experience-audit`: **25/25**;
- migração 24 executada em smoke test SQLite isolado: **PASS**;
- opt-in começa desmarcado e o backend assume `false` quando o campo não é enviado;
- concessão exige `marketingConsent === true`;
- booking posterior desmarcado não revoga opt-in existente;
- área CLIENT possui consulta e alteração explícita da preferência;
- painel ADMIN sinaliza autorização atual;
- endpoint de broadcast permanece bloqueado.

## Experiência e regressão

- matriz Chromium dedicada: **35 PASS / 0 FAIL**;
- `responsive-audit`: **26/26**;
- `visual-system-audit`: **22/22**;
- `ux-audit`: **18/18**;
- `iconography-audit`: **16/16**;
- `luma-experience-audit`: **12/12**;
- `referral-audit`: **12/12**;
- `onboarding-audit`: **16/16**;
- `v24-structural-audit`: **26/26**;
- **50/50** arquivos TypeScript/TSX passaram no parse sintático isolado;
- JSONs e scripts de auditoria validados.

## QA visual

A confirmação do booking foi renderizada com nome e telefone preenchidos em formato `+55`, checkbox promocional desmarcado por padrão, `Ler mais` e CTA final. Não houve overflow horizontal nem compressão vertical de texto nos 35 cenários da matriz.

## Gate de dependências/build integral

Foi tentado `npm ci`. O registry npm interno deste ambiente respondeu `404` para `zod-validation-error@4.0.2`, dependência transitiva de `eslint-plugin-react-hooks@7.0.1`. Como as dependências não puderam ser materializadas, `npm run typecheck`, `npm run lint`, os testes Node via `tsx` e o build Vite integral não podem ser declarados como executados neste ambiente.

Permanecem obrigatórios em CI/VPS com registry npm funcional:

```bash
npm ci
npm run check
npm run preflight
```

## Homologação externa

Dependem de credenciais/infra reais: InfinitePay, OpenRouter, Evolution/WhatsApp, DNS/TLS/Caddy, Firefox, Safari/WebKit e dispositivos físicos.

# Validação 3.1.0 — Luma Intelligence Atelier

- 17/17 `luma-experience-audit`;
- 26/26 responsividade;
- 16/16 iconografia;
- 22/22 sistema visual;
- 18/18 UX/overlays;
- 12/12 indicações;
- 16/16 onboarding;
- 25/25 experiência pública;
- 15/15 consentimento;
- 26/26 estrutural;
- 49/49 arquivos TS/TSX de runtime passaram em transpilação sintática isolada;
- `src/luma-v31.css`: 0 `!important`, 0 `100vw/100dvw`;
- QA geométrico dedicado em Chromium: página e drawer, estado vazio e conversa, desktop/mobile, sem overflow horizontal; composer dentro do viewport em 1440×900, 1024×768, 390×844 e 320×568;
- folha visual antiga `src/luma-v24.css` removida do runtime e do projeto.

`npm ci --ignore-scripts` continua bloqueado externamente pelo `404` do registry interno para `zod-validation-error@4.0.2`; build integral permanece gate de CI/VPS.

# Validação 3.2.0 — Luma Native Intelligence

- 12/12 cenários dedicados Chromium da Luma 3.2 sem overflow/clipping estrutural;
- página e drawer validados em estado vazio e conversa;
- desktop em 1440×900 e 1024×768;
- mobile em 390×844 e pressão adicional em 320×568;
- 18/18 `luma-experience-audit`;
- 26/26 responsividade;
- 22/22 sistema visual;
- 18/18 UX/overlays;
- 16/16 iconografia;
- 12/12 indicações;
- 16/16 onboarding;
- 25/25 experiência pública;
- 15/15 consentimento;
- 26/26 estrutural;
- 49/49 arquivos TS/TSX de runtime passaram em transpilação sintática isolada;
- `src/luma-v32.css`: 0 `!important`, 0 `100vw/100dvw`;
- `src/luma-v31.css` removido;
- `npm ci --ignore-scripts --no-audit --no-fund`: bloqueado por `404` do registry interno em `zod-validation-error@4.0.2`.

O build integral permanece gate obrigatório de CI/VPS.


# Validação 3.3.0 — Product Design System Foundation

- Landing Page explicitamente fora do escopo do sistema de produto;
- `src/product-system-v33.css` introduz tokens `--ld-*` sem sobrescrever visualmente as telas legadas;
- `scripts/design-system-contract.mjs` aprovado;
- baseline registra dívida atual e impede aumento de `!important`, `100vw/100dvw`, cores locais e escalas de radius por arquivo;
- 26/26 responsividade;
- 16/16 iconografia;
- 22/22 sistema visual;
- 18/18 UX/overlays;
- 12/12 indicações;
- 16/16 onboarding;
- 26/26 estrutura 2.4;
- 18/18 Luma;
- 25/25 experiência pública;
- 15/15 consentimento;
- fixture visual do Design System renderizada em Chromium sem overflow do documento;
- `npm ci --ignore-scripts --no-audit --no-fund` continua bloqueado pelo `404` do registry interno em `zod-validation-error@4.0.2`.

A 3.3 define o contrato e a ordem de migração; ela deliberadamente não redesenha todas as telas de uma vez.

# Validação 5.10.3 — Mobile App Foundation · Parte 4

## Escopo validado

- Configurações;
- Indicações;
- Setup/Onboarding;
- Booking público.

## Auditorias executadas

- `mobile-app-v510-part4-audit`: **20/20**;
- QA visual Chromium dedicado: **12/12**, viewports 390×844, 430×900 e 768×900, sem overflow horizontal;
- `responsive-audit`: **26/26**;
- `referral-audit`: **12/12**;
- `onboarding-audit`: **16/16**;
- `mobile-app-v510-audit`: **22/22**;
- `mobile-app-v510-part2-audit`: **18/18**;
- `mobile-app-v510-part3-audit`: **18/18**;
- `product-consistency-audit`: **19/19**;
- `customer-experience-audit`: **25/25**;
- `ux-audit`: **18/18**;
- `iconography-audit`: **16/16**;
- `visual-system-audit`: **22/22**.

## Design System 3.3

O `design-system-contract` ainda reporta três regressões já existentes antes da Parte 4: aumento histórico de raw hex em `src/design-system.css` e presença de `!important` em `src/mobile-app-v510.css` e `src/mobile-app-v510-part3.css`.

A nova folha `src/mobile-app-v510-part4.css` foi deixada sem `!important`, sem `100vw/100dvw` e sem cores hex locais, portanto não adiciona novo débito ao contrato.

## Gate integral

`npm run typecheck`, `npm run build` e o pipeline integral continuam como gate de CI/VPS após `npm ci` em ambiente com registry funcional.
