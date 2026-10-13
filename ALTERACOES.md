# 5.13.0 — Luma Integrada, Gestão de Presença, Ações Operacionais e Créditos Appmax

- **Luma com Ferramentas Operacionais e Aprovação Humana (`server/lumaOperations.ts` e `server/routes/adminLumaOperationsRoutes.ts`)**:
  - Ações operacionais preparadas com proposta atômica, expiração e confirmação explícita (`assistant_operation_actions`): registro de presença real em agendamentos (`ATTENDED`, `NO_SHOW`), lançamentos e correções financeiras com controle de versão/concorrência, metas do estúdio, abertura e respostas a chamados de suporte, e preferências da assistente (`assistant_preferences`).
  - Resumos de agenda e rotina de até 93 dias com paginação e fuso horário do estúdio (`lumaCalendar`).
  - Lembretes pessoais no WhatsApp da administradora via Evolution API (`assistant_reminders`) com worker dedicado (`server/lumaReminderRuntime.ts`), respeitando fuso horário e evitando reenvio em incertezas.
  - Isolamento estrito por estúdio (`tenant_id`) e usuária (`user_id`).
- **Recarga de Créditos da Luma via Appmax (`server/lumaAppmaxCredits.ts`)**:
  - Compra de pacotes extras de créditos através do checkout Appmax (25 créditos por R$ 5,00, 100 créditos por R$ 12,90, 250 créditos por R$ 24,90).
  - Tabela `assistant_appmax_orders` vinculada a `assistant_credit_orders`.
  - Reconciliação atômica via webhook e fallback para pedidos legados.
- **Refinamento de Equipe e Exclusão Segura (Migração 47)**:
  - Exclusão lógica de profissionais (`removed_at` em `professionals`): libera a vaga da equipe mantendo o histórico de atendimentos íntegro.
  - Correção de telefone de convite pendente e contas STAFF com invalidação de sessões e desafios MFA.
  - Proteção da administradora contra exclusão pelo fluxo de equipe.
- **Migração 46 (`server/lumaOperationsSchema.ts`)**:
  - Coluna `credit_source` em `assistant_usage`.
  - Colunas `attendance_status`, `attendance_recorded_at`, `attendance_recorded_by` em `appointments`.
  - Tabelas `assistant_operation_actions`, `assistant_preferences`, `assistant_reminders`, `assistant_appmax_orders`.
- **Suíte de Testes e Auditorias Integradas**:
  - 28 novos testes unitários/integrados (`server/lumaOperations.test.ts`, `server/lumaAppmaxCredits.test.ts`), totalizando 209 testes na suíte.
  - Script de validação de interface `npm run test:luma-integrated-ui` (`scripts/check-luma-integrated-ui.mjs`).

---

# 5.12.14 — Equipe Independente e Central de Suporte Simplificada

- **Módulo de Equipe Desacoplado (`src/features/team/`)**:
  - Remoção de `ProfessionalManager.tsx` de dentro de `AdminServices.tsx`.
  - Nova aba e rota `/admin?view=team` integrada à navegação via `goTab("team")` em `AdminApp.tsx`.
  - Cadastro em 3 etapas com seleção explícita de serviços (exibindo duração e preço) e horários personalizados.
  - Gestão de folgas com timezone explícito do estúdio (`ProfessionalTimeOff.tsx`).
  - Gestão de acesso staff com tokens de convite descartáveis e suspensão/reativação segura (`ProfessionalAccess.tsx`).
  - Ocultação do launcher flutuante da Luma na aba de Equipe para evitar sobreposição de ações e modais.
- **Validação e Proteção no Backend (`server/routes/adminProfessionalsRoutes.ts`)**:
  - Rejeição no Zod (`hoursSchema.superRefine`) contra períodos de atendimento sobrepostos no mesmo dia da semana para o mesmo profissional.
  - Proteção da conta ADMIN contra suspensão pelo endpoint de acesso STAFF (`u.role = "STAFF"`).
  - Exposição de `businessHours` e `timezone` do estúdio em `GET /professionals`.
- **Redesenho Amigável da Central de Suporte (`src/features/support/`)**:
  - Formulário intuitivo ("Como podemos ajudar?") com validação inline imediata em português sem balões nativos do navegador.
  - Categoria e urgência recolhidas em sanfona de detalhes opcionais.
  - Diferenciação visual de balões (`.from-user` vs `.from-support`), guia contextual de próximo passo (`statusHelp`) e botão "Responder ao atendimento".
  - Isolamento estrito de notas internas e controles de prioridade/atribuição para a equipe DEV.
- **Controles de Formulário Acessíveis (`src/styles.css`)**:
  - Estilização de `input[type="checkbox"]` e `input[type="radio"]` preservando foco por teclado (`:focus-visible`), acessibilidade e semântica nativa.
- **Automação e Auditorias de QA**:
  - Adição do script `npm run test:team-ui` (`scripts/check-team-ui.mjs`).
  - Atualização do script `npm run test:support-ui` (`scripts/check-support-ui.mjs`).

---

# 5.12.13 — Hotfix Visual do Marcador de Atividades do Dashboard

- **Geometria dos Marcadores de Atividade (`AdminDashboard.tsx`)**:
  - Fixação de dimensões e proporção `flex: "0 0 12px"`, `width: 12`, `height: 12`, `aspect-ratio: 1`, `min-width: 0`.
  - Quebra de linha segura com `overflowWrap: "anywhere"` para evitar distorção visual em descrições longas.

---

# 5.12.12 — Planos por Equipe com Appmax e Sistema de Indicações com Governança de Estorno

- **Planos por Equipe Integrados**: Implementação completa dos planos `TEAM_3` (R$ 74,90), `TEAM_6` (R$ 99,90) e `TEAM_15` (R$ 149,00).
- **Checkout Appmax em Produção**:
  - Correção no cliente `server/appmax.ts` para enviar array plano de métodos de pagamento `payments: ['creditcard', 'pix']` em `/v1/payment-link`, eliminando erro HTTP 422 de validação.
  - Liberação da flag de produção em `server/env.ts` com validação obrigatória das credenciais `APPMAX_MERCHANT_CLIENT_ID` e `APPMAX_MERCHANT_CLIENT_SECRET`.
- **Migração 45 (Ledger de Indicações e Estornos)**:
  - Adição de `gross_amount_cents`, `discount_percent` e `referral_redemption_id` em `appmax_checkout_intents`.
  - Criação das tabelas `appmax_referral_memberships`, `appmax_referral_debts` e `appmax_referral_debt_allocations`.
  - Governança de estornos: créditos indevidamente usufruídos são compensados automaticamente de futuras recompensas acumuladas.
- **Segurança de Checkout**:
  - Geração de `quoteFingerprint` (SHA-256) garantindo integridade de valor e desconto entre cotação e pagamento.
  - Bloqueio estrito de autoindicação por e-mail, telefone normalizado em E.164 e identificador de estúdio.
  - Rate limiting em memória (`publicCheckoutLimiter`) em rotas públicas de cotação e checkout.
- **Auditorias e Testes**: Adição de auditorias automáticas `test:architecture`, `test:recovery-ui`, `test:support-ui`, `test:landing-team-ui`, `test:billing-ui`, `test:report-ux-ui` e `test:referral-team-ui`.

---

# 5.12.10 — Correções Visuais e Homologação Responsiva

- Correções de layout, paddings e contrastes nas telas de Onboarding, Setup e Painel Admin.
- Estabilização de fluxos responsivos em viewports mobile (320px a 430px) e desktop (1440px).
- Refinamento de acessibilidade e semântica de formulários no fluxo de agendamento público.

---

# 5.12.9 — Atualização da Landing Page e Pricing

- Sincronização da Landing Page para refletir a nova oferta comercial de planos por equipe.
- Reorganização das seções de pricing, FAQ e chamadas de conversão com classes `ld54-*`.

---

# 5.12.8 — Central de Suporte e Modo de Recuperação

- **Migração 44 (Central de Suporte)**:
  - Criação de `support_tickets`, `support_messages`, `support_attachments` e `support_notifications`.
  - Protocolos de chamado atômicos no formato `SUP-YYYYMMDD-XXXX`.
  - Anexos binários seguros armazenados diretamente no SQLite com download autenticado.
- **Migração 43 (Modo de Recuperação)**:
  - Criação de `suspension_reason` ('APPMAX' vs bloqueio administrativo manual).
  - Modo de recuperação que libera autenticação ADMIN, telas de billing e suporte para estúdios suspensos regularizarem pendências.

---

# 5.4.1 — Landing Corrective

- headline do hero reduzida para um teto de ~66 px no desktop;
- supporting copy reescrita para falar da rotina real, sem vocabulário abstrato de SaaS;
- GSAP 3.15.0 adicionado como única nova dependência de motion;
- ScrollTrigger coordena palco de produto, scroll story e parallax;
- SplitText cria reveals mascarados por palavras/linhas;
- CTAs principais recebem interação magnética com GSAP;
- Agendamento / WhatsApp / Gestão vira scroll story sticky em desktop e fluxo tocável em telas menores;
- mesh, glows e grain substituem o fundo flat sem depender de um segundo framework visual;
- `prefers-reduced-motion` continua respeitado;
- Landing audit 22/22, matriz estática completa verde e testes independentes 53/53;
- build/typecheck integral permanece para o ambiente de deploy porque esta sessão não possui dependências instaladas.

Consulte `docs/RELEASE_5.4.1.md`.

---

# 5.3.0 — Sales-first Landing Rebuild

- hero reescrito para vender continuidade operacional durante o atendimento;
- produto real passa a dominar a primeira dobra, com Agenda em vídeo, Visão Geral e Luma;
- logo real substitui o wordmark provisório da 5.2;
- bloco escuro dramatiza dores reais da rotina em vez de listar features;
- Agendamento, WhatsApp e Gestão foram consolidados em um único módulo interativo;
- Luma permanece depois do core e explicitamente opcional;
- pricing e CTA final receberam copy mais orientada a compra;
- QA visual em 390, 768, 1440 e 1920 px sem overflow horizontal;
- os três estados do módulo operacional foram verificados em desktop e mobile;
- removido `id` duplicado e restaurado o contrato visual da conversa WhatsApp detectado durante o QA;
- Landing audit 27/27 e testes independentes de migrations/security/WhatsApp 53/53.

Consulte `docs/RELEASE_5.3.0.md`.

---

# 4.0.0 RC — System Consistency

- todos os `<select>` nativos renderizados pelo produto foram removidos e substituídos pelo `ProductSelect` canônico;
- Financeiro, WhatsApp, Setup, horários, configurações administrativas e filtros compartilham a mesma geometria, menu, teclado, foco e responsividade;
- clones visuais antigos `custom-select`/`time-select-*` e CSS correspondente foram removidos;
- gráfico artesanal do Financeiro foi substituído por `FinanceFlowChart` com Chart.js 4.5.1;
- meses sem movimentação deixam de fabricar uma linha de saldo zero;
- modal `Nova movimentação` e Extrato foram reorganizados e responsivizados;
- Luma e WhatsApp deixaram de carregar paletas hex locais e agora derivam suas cores dos tokens do Design System 3.3;
- novo audit `test:consistency` protege o contrato e passou 19/19;
- QA visual dedicado passou 6/6, WhatsApp 10/10 e matriz focada legada 21/21;
- release mantida como RC porque `npm ci` ficou bloqueado por `EAI_AGAIN` no registry do ambiente, impedindo o gate completo de typecheck/build.

Consulte `docs/RELEASE_4.0.0.md`.

---

# 3.9.0 — WhatsApp Reliability & Product Polish

- caminho inbound reforçado: webhook da Evolution é preparado também no status, na conexão por QR e antes de envios manuais;
- parser de mensagens recebidas aceita `remoteJidAlt`/`@lid`, mantém filtro de grupos e persiste inbound no histórico local;
- nova rota de diagnóstico mostra webhook preparado e timestamps de última entrada/saída;
- polling da inbox não usa mais `scrollIntoView`; scroll da página é preservado e o chat só acompanha novas mensagens quando a usuária já está próxima do fim;
- nova conversa passa a salvar **nome + WhatsApp + primeira mensagem**; contatos sem nome deixam de aparecer como número cru;
- empty state de Conversas consolidado em uma única composição com CTA;
- automações de confirmação foram compactadas em um fluxo único e a cliente responde apenas `1` ou `2` no caso normal; identificador interno fica restrito ao fallback realmente ambíguo;
- Campanhas agora mostra audiência autorizada e estado operacional, mantendo broadcast em massa bloqueado;
- Conexão ganhou diagnóstico de recebimento e esconde detalhes técnicos/QR quando nenhuma ação é necessária;
- camada visual `whatsapp-v38.css` foi substituída por `whatsapp-v39.css`;
- auditoria dedicada do WhatsApp: 25/25; QA visual dedicado: 10/10 viewports/estados sem overflow involuntário.

Consulte `RELATORIO_LashDesigner_3.9.0.md`.

---

# 3.2.0 — Luma Native Intelligence

- Luma reintegrada ao design system da plataforma.
- Página deixou o visual rígido/quadrado da 3.1 e passou a usar canvas arredondado, superfícies suaves e prompts nativos.
- Drawer agora é uma sheet inset arredondada no desktop e full-screen intencional no mobile.
- Conversa redesenhada com pergunta blush + análise elevada, sem aparência de ChatGPT.
- Composer, launcher, estados de erro e loading alinhados à mesma geometria visual.
- `luma-v31.css` removido e substituído por `luma-v32.css`.

# Alterações

## 3.0.0 — Maison Appointment

- Reconstrução integral da direção visual do booking público.
- Removida a composição lateral promocional das versões 2.8/2.9.
- Nova jornada horizontal 01–04, dossier claro de reserva e composição editorial.
- Serviço, datas, horários e confirmação redesenhados sem alterar regras de negócio.
- CTA final passa a refletir o horário selecionado.
- Consentimento e telefone inteligente preservados.
- Novo CSS `booking-v30.css`, sem `!important` e sem SVG decorativo.

Consulte `docs/RELEASE_3.0.0.md` e `docs/VISUAL_QA_MATRIX_3.0.md`.

## 2.9.0 — Booking Product Polish

- direção visual da 2.8 descartada: removida a composição `bloco vinho + foto em meia tela + card flutuante`;
- booking desktop passa a crescer pela altura real do conteúdo, eliminando o vazio artificial de dashboard;
- lateral compacta e sólida, sem SVG decorativo, sem glow e sem shape abstrato;
- fotografia passa a ser contextual ao serviço selecionado e ocupa apenas um card editorial controlado;
- resumo lateral foi reduzido para data/horário, evitando repetir serviço/preço em três lugares;
- confirmação usa uma faixa limpa com thumbnail do serviço, valor/duração e data/horário;
- copy final reduzida para `Nome e WhatsApp. Só isso.`;
- progresso simplificado para etapa atual + quatro segmentos discretos;
- mobile preserva a mesma linguagem sem tentar reproduzir a lateral desktop;
- máscara `+55` e consentimento promocional da 2.7 permanecem intactos;
- `booking-v28.css` foi removido e substituído por `booking-v29.css`, sem empilhar override.

Consulte `docs/RELEASE_2.9.0.md` e `docs/VISUAL_QA_MATRIX_2.9.md`.

---

## 2.8.0 — Booking Art Direction Refinement

- booking público reconstruído visualmente sem o SVG decorativo da 2.6/2.7;
- nova lateral editorial com fotografia humana já licenciada no pacote visual do produto;
- stepper substituído por navegação de jornada numerada, em largura total;
- copy reduzida e quebras tipográficas controladas;
- cards e resumo final simplificados para reduzir a sensação de interface genérica;
- consentimento de marketing da 2.7 preservado integralmente;
- telefone inteligente da 2.6 preservado;
- `booking-v27.css` foi substituído por `booking-v28.css`, sem empilhar outra folha de override.

# 2.7.0 — Marketing Consent & Messaging Readiness

- checkbox opcional e desmarcado por padrão no fechamento do agendamento;
- copy curta `Quero receber novidades e ofertas no WhatsApp.` com `Ler mais` progressivo;
- consentimento não interfere no booking e uma caixa desmarcada em booking futuro não revoga autorização anterior;
- migração 24 adiciona estado atual de opt-in e trilha auditável de concessão/retirada;
- versão, texto, origem e timestamp do consentimento ficam preservados;
- área da cliente permite ativar/desativar promoções depois do OTP;
- painel de clientes mostra quem autorizou promoções;
- broadcast automático continua bloqueado até existir worker seguro e segmentação por consentimento ativo;
- `booking-v26.css` foi substituído por `booking-v27.css`;
- auditoria dedicada de consentimento: 15/15;
- matriz Chromium pública: 35/35 cenários aprovados.

Consulte `docs/RELEASE_2.7.0.md`, `docs/MARKETING_CONSENT_2.7.md` e `docs/VISUAL_QA_MATRIX_2.7.md`.

---

# 2.6.0 — Booking Brand Polish & Phone Normalization

- máscara automática de WhatsApp no booking e acesso CLIENT;
- reconhecimento consistente de número local, `55` e `+55`, sem duplicar DDI;
- normalização canônica também no backend e nos rate limits por telefone;
- rejeição explícita de DDI internacional diferente de `+55`;
- copy do booking reduzida para remover informação desnecessária;
- headline lateral e títulos recalibrados para evitar quebras de linha artificiais;
- stepper passa a ocupar a largura útil com quatro etapas nomeadas;
- resumo mobile não é duplicado na confirmação;
- cards, campos, revisão e rodapé final foram compactados;
- novo motivo gráfico sutil em SVG humaniza o booking sem poluir;
- `booking-v25.css` foi substituído por `booking-v26.css`, sem empilhar uma nova folha de overrides;
- matriz Chromium 2.6: 35/35 cenários aprovados.

Consulte `docs/RELEASE_2.6.0.md` e `docs/VISUAL_QA_MATRIX_2.6.md`.

---

# 2.5.0 — Public Experience Rebuild

- agendamento público completamente reconstruído com prioridade mobile;
- reserva não exige conta, e-mail nem senha: apenas nome + WhatsApp na confirmação;
- cada escolha avança a etapa automaticamente e o Product Tour foi removido do booking;
- área da cliente migra para acesso passwordless por WhatsApp em navegador sem sessão válida;
- OTP de 6 dígitos, expiração curta, uso único, limite de tentativas e rate limit;
- sessão persistente reduz confirmações repetitivas no mesmo navegador;
- identidade existente não pode ser sobrescrita por dados anônimos de um booking público;
- landing recebe header, prova social, CTA final e footer redesenhados;
- exemplos de feedback demonstrativos permanecem explicitamente marcados;
- matriz Chromium dedicada cobre as quatro etapas do booking desde 320 px.

Consulte `docs/RELEASE_2.5.0.md`, `docs/CUSTOMER_EXPERIENCE_2.5.md` e `docs/VISUAL_QA_MATRIX_2.5.md`.

## 5.11.0 — Mobile Experience Direction Pass 1
- Home redesenhada para priorizar próximo atendimento e contexto do dia.
- Agenda ganhou timeline diária mobile independente do calendário desktop.
- Clientes ganharam composição mobile baseada em dados reais da base.
- Booking público ganhou galeria visual de serviços e horários agrupados por período.
- Bottom navigation virou dock flutuante de aplicativo.
- Nova camada `mobile-experience-v511.css`, sem `!important`, `100vw/100dvw` ou paleta hex local.
- Adicionados audit e QA visual próprios da 5.11.

