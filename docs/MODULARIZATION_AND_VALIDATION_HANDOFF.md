# Modularização e homologação — plano de execução

## Objetivo

Eliminar os pontos monolíticos de `src/App.tsx` e `server/index.ts` sem alterar contratos HTTP, regras de negócio, segurança, aparência ou dados persistidos. Cada checkpoint precisa compilar e passar pela esteira completa antes da próxima extração.

## Estado inicial comprovado

- `npm ci`: aprovado;
- `npm run check`: aprovado antes da refatoração;
- frontend e servidor compilam;
- 132 rotas Express catalogadas;
- gargalos iniciais: `src/App.tsx` com 7.447 linhas e `server/index.ts` com 7.582 linhas;
- bundle inicial: 1.111,04 kB de JavaScript e 523,05 kB de CSS antes de gzip.

## Checkpoint 1 implementado

Infraestrutura semântica foi retirada das entradas principais:

- `src/lib/runtime.ts`: URLs de runtime, clipboard e otimização padrão de imagens;
- `server/middleware/rateLimit.ts`: limites transitórios e persistentes;
- `server/middleware/requestSecurity.ts`: Same Origin, segredo de webhook e comparação temporal segura;
- `server/middleware/tenantRouting.ts`: host DEV, slug, domínio e resolução de tenant;
- `scripts/architecture-boundaries-audit.mjs`: impede regressão imediata do tamanho e remoção acidental das extrações.

## Checkpoint 2 implementado

O frontend passou pela primeira separação de componentes e contratos reutilizáveis:

- `src/features/shared/types.ts`: contratos de dashboard, agenda, clientes, serviços e financeiro;
- `src/components/PortalMenu.tsx`: menu portaled com reposicionamento, clique externo e Escape;
- `src/components/SharedUi.tsx`: estados vazios, switch e item de navegação;
- `src/lib/runtime.ts`: caminhos públicos, capas de serviço, presença, moeda e rótulos financeiros;
- `src/App.tsx` caiu de 7.447 para aproximadamente 7.100 linhas sem alteração de tela ou contrato.

O gate arquitetural foi reduzido para que o arquivo não possa regressar ao tamanho anterior.

## Checkpoint 3 implementado

A montagem HTTP global foi extraída para `server/appFoundation.ts`, preservando a ordem de execução:

- identificação de requisição e Permissions Policy;
- CORS dinâmico para plataforma, DEV, subdomínios e domínios dos tenants;
- Helmet, CSP, HSTS e Referrer Policy;
- parsers JSON e URL-encoded com os mesmos limites;
- cookies, resolução de tenant, sessão e proteção Same Origin;
- `Cache-Control: no-store` para a API.

O `server/index.ts` caiu de 7.582 para aproximadamente 7.270 linhas desde o início. Foram adicionados quatro testes comportamentais para Same Origin, segredo de webhook, comparação temporal segura e endereços loopback. O gate do backend agora bloqueia regressão acima de 7.300 linhas.

## Checkpoint 4 implementado

O ciclo de sessão HTTP foi extraído para `server/authSessionRuntime.ts`:

- nomes seguros `__Host-*` em produção;
- opções compartilhadas de cookie;
- pré-autenticação com expiração de dez minutos;
- dispositivo confiável com o TTL canônico;
- sessão persistente de 30 dias;
- limpeza de cookies com os mesmos atributos;
- metadados de IP e user-agent;
- criação da sessão opaca e envio do cookie.

Foram acrescentados testes comportamentais para nomes `__Host-*`, flag `Secure`, cookie de pré-autenticação, dispositivo confiável e duração da sessão persistente. O conjunto principal passou de 36 para 38 testes. `server/index.ts` chegou a aproximadamente 7.230 linhas e o novo teto é 7.250.

## Checkpoint 5 implementado

O adaptador da InfinitePay foi extraído para `server/infinitePay.ts`. O módulo agora concentra criação segura de checkout, validação do payload do webhook, confirmação por `payment_check`, higienização da URL de recibo, hash de idempotência e registro dos eventos recebidos. As rotas continuam no arquivo de composição neste estágio, mantendo intactos caminhos HTTP, middlewares e ordem de processamento.

Foram adicionados testes para restrição HTTPS dos recibos, bloqueio de credenciais embutidas em URL, estabilidade do hash e contrato mínimo do webhook. O conjunto principal passou de 38 para 41 testes. `server/index.ts` ficou abaixo de 7.140 linhas, limite que passa a impedir o retorno acidental dessa lógica ao monólito.

## Checkpoint 6 implementado

A central de notificações foi extraída para `src/components/NotificationsModal.tsx`. O novo componente preserva os três fluxos por papel — DEV, ADMIN e CLIENT —, as mesmas APIs, classificação visual dos eventos, carregamento, fechamento por clique externo, marcação local como lida e cálculo de tempo relativo.

O `App.tsx` caiu de aproximadamente 7.090 para 6.949 linhas. O gate do frontend agora bloqueia regressão acima de 6.970 linhas e exige explicitamente que a central continue fora do arquivo principal. Esta movimentação é estrutural: não altera rotas, CSS, textos, payloads ou comportamento visível.

## Checkpoint 7 implementado

O layout estrutural foi extraído para `src/layouts/Shell.tsx`. O módulo concentra sidebar desktop, drawer móvel com contenção e restauração de foco, recolhimento persistente, cabeçalho, busca, notificações, abertura segura do Product Tour e navegação inferior mobile.

A assinatura pública do `Shell` e seus consumidores foram preservados. O `App.tsx` caiu para aproximadamente 6.677 linhas, e o novo teto arquitetural é 6.700. A extração prepara as páginas para migrarem por domínio sem duplicar navegação, comportamento responsivo ou coordenação de overlays.

## Checkpoint 8 implementado

A primeira página funcional foi extraída para `src/features/services/AdminServices.tsx`. A área conserva listagem desktop, cartões mobile, criação, edição, exclusão protegida por confirmação, upload e otimização de capa, fallbacks visuais e os mesmos contratos HTTP.

O `App.tsx` caiu de aproximadamente 6.677 para 6.273 linhas. O teto arquitetural passa a ser 6.300 linhas e exige que a página de Serviços permaneça no módulo de domínio. Esta extração valida o padrão que será usado nas próximas áreas administrativas: mover a tela completa antes de introduzir lazy loading ou reorganizar suas regras internas.

## Checkpoint 9 implementado

A área de clientes foi extraída para `src/features/clients/AdminClients.tsx`. Permanecem intactos o carregamento seguro com cancelamento lógico após desmontagem, a busca por nome/telefone/e-mail, os avatares determinísticos, o destaque da cliente com maior valor, consentimento promocional, última visita e total gasto.

As representações desktop e mobile continuam compartilhando os mesmos dados filtrados. O `App.tsx` ficou abaixo de 6.150 linhas, novo teto do gate arquitetural, e a auditoria mobile passou a verificar diretamente o módulo de Clientes.

## Checkpoint 10 implementado

O dashboard administrativo foi extraído para `src/features/dashboard/AdminDashboard.tsx`. Foram preservados saudação por fuso do tenant, métricas diárias, confirmações que exigem atenção, ações de presença, próximos agendamentos, atividade recente e link público copiável.

As composições desktop e mobile permanecem no mesmo módulo e continuam usando os dados de `AdminStats`. O `App.tsx` caiu para aproximadamente 5.689 linhas, com novo teto de 5.720. As auditorias de agenda, dashboard mobile e menu portaled agora verificam diretamente a nova fronteira.

## Checkpoint 11 implementado

Os modais administrativos da Agenda foram extraídos para `src/features/calendar/AppointmentModals.tsx`. O módulo concentra o seletor adaptado de serviços, criação manual de agendamento, detalhes do atendimento, confirmação de presença, reenvio por WhatsApp, cancelamento e exclusão protegida.

Os contratos HTTP, payloads, textos, estados de presença, fuso horário e coordenação por `ModalRoot` foram preservados. O `App.tsx` caiu para 5.365 linhas, com novo teto arquitetural de 5.400. A auditoria do ciclo de agendamentos passou a validar diretamente o novo módulo e a suíte completa permaneceu aprovada.

## Checkpoint 12 implementado

A página administrativa completa da Agenda foi extraída para `src/features/calendar/AdminCalendar.tsx`. O novo módulo concentra carregamento e atualização dos eventos, navegação diária/semanal/mensal, agrupamentos mobile, redimensionamento responsivo por `ResizeObserver`, estados de presença e abertura dos modais já isolados no checkpoint anterior.

Foram preservados contratos HTTP, payloads, mutações, fuso horário, seleção de datas, filtros e composição desktop/mobile. O `App.tsx` caiu para 4.384 linhas, com novo teto arquitetural de 4.420. As auditorias estrutural, mobile, de consistência e do ciclo de agendamentos agora inspecionam diretamente o módulo da Agenda. A suíte `npm run check` permaneceu integralmente aprovada, incluindo o build de produção; segue apenas o aviso conhecido de bundle acima de 500 kB, cuja divisão por rotas continua prevista para depois das extrações estruturais.

## Checkpoint 13 implementado

A página administrativa do Financeiro e seus três modais foram extraídos para `src/features/finance/AdminFinance.tsx`. O módulo concentra indicadores mensais, gráfico de entradas/saídas/saldo, movimentações manuais, exclusão protegida, extrato com exportação CSV, metas e integração contextual com a Luma.

Foram preservados endpoints, métodos, payloads, cálculo em centavos, datas civis, fuso do tenant, proteção contra fórmulas em CSV, componentes canônicos e composição responsiva. O `App.tsx` caiu para 3.757 linhas, com novo teto arquitetural de 3.800. As auditorias de finanças, iconografia e consistência agora inspecionam diretamente o novo módulo. A suíte `npm run check` permaneceu integralmente aprovada, incluindo 24/24 verificações financeiras e o build de produção; segue apenas o aviso conhecido de bundle acima de 500 kB.

## Checkpoint 14 implementado

As Configurações administrativas e o cartão reutilizável de Segurança da conta foram extraídos para `src/features/settings/AdminSettings.tsx`. O módulo concentra identidade visual do tenant, upload e otimização de logo, cor principal, assinatura e faturas, alteração de senha, WhatsApp de segurança, dispositivos confiáveis, sessões ativas e preferências legais/promocionais.

O cartão de Segurança e o tipo de preferências legais permanecem exportados para reutilização pelo console DEV e pelo gate administrativo, sem duplicação. Foram preservados endpoints, métodos, payloads, atualização imediata do tema, comprovantes, política de senha, MFA, revogação de sessões e documentos aceitos. O `App.tsx` caiu para 3.197 linhas, com novo teto arquitetural de 3.240. As auditorias legal, mobile, de senha, tema e arquitetura agora inspecionam diretamente o novo módulo. A suíte `npm run check` permaneceu integralmente aprovada, incluindo 44/44 verificações de segurança e o build de produção; segue apenas o aviso conhecido de bundle acima de 500 kB.

## Checkpoint 15 implementado

Partindo das 3.197 linhas deixadas pelo checkpoint 14, o fluxo público de agendamento foi extraído para `src/features/booking/BookingPage.tsx`, junto do `DateScroller` utilizado exclusivamente pela experiência de reserva. O módulo concentra carregamento do tenant, serviços e regras da agenda, disponibilidade por data, geração de horários por fuso, quatro etapas do booking, identificação por nome e WhatsApp, consentimento promocional opcional e confirmação final.

Foram preservados endpoints, métodos, payloads, regras de antecedência, detecção de conflitos, navegação, tema do tenant, comportamento desktop/mobile e textos legais. O `App.tsx` caiu para 2.782 linhas, com novo teto arquitetural de 2.820. As auditorias de experiência da cliente, consentimento, ciclo de agendamentos, legal, mobile e arquitetura agora inspecionam diretamente o novo módulo. A suíte `npm run check` permaneceu integralmente aprovada, incluindo 25/25 verificações da experiência da cliente, 16/16 de consentimento e o build de produção; segue apenas o aviso conhecido de bundle acima de 500 kB.

## Checkpoint 16 implementado

Partindo das 2.782 linhas deixadas pelo checkpoint 15, o Portal da Cliente foi extraído para `src/features/client/ClientPortal.tsx`. O módulo concentra acesso passwordless por WhatsApp, sessão persistente, carregamento dos agendamentos, status de presença, navegação para nova reserva e controle das preferências promocionais.

O gerador compartilhado de passos do Product Tour também foi extraído para `src/lib/tourSteps.ts`, mantendo ADMIN, DEV e Cliente na mesma fonte sem dependência circular. Foram preservados endpoints, métodos, payloads, normalização de telefone, OTP, fuso do tenant, logout, estados de presença e consentimento. O `App.tsx` caiu para 2.511 linhas, com novo teto arquitetural de 2.540. As auditorias de experiência da cliente, consentimento, ciclo de agendamentos e arquitetura agora inspecionam diretamente o novo módulo. A suíte `npm run check` permaneceu integralmente aprovada, incluindo 25/25 verificações da experiência da cliente, 16/16 de consentimento e o build de produção; segue apenas o aviso conhecido de bundle acima de 500 kB.

## Checkpoint 17 implementado

Partindo das 2.511 linhas deixadas pelo checkpoint 16, o fluxo de autenticação profissional foi extraído para `src/features/auth/Authentication.tsx`. O módulo exporta `UnifiedLogin` e `RootEntry` e concentra login por email e senha, permanência da sessão, cadastro inicial do WhatsApp, envio e verificação do OTP, confiança do dispositivo, bootstrap seguro do primeiro usuário DEV e decisão de destino conforme o papel autenticado.

Foram preservados endpoints, métodos, payloads, política de senha, normalização de telefone, temas DEV e tenant, tempos de redirecionamento, estados de carregamento e rotas finais. O redirecionamento de subdomínio permaneceu no roteador por pertencer à resolução de host. O `App.tsx` caiu para 2.051 linhas, com novo teto arquitetural de 2.100. As auditorias de segurança, senha e arquitetura agora inspecionam diretamente o módulo de autenticação. A suíte `npm run check` permaneceu integralmente aprovada, incluindo 44/44 verificações de segurança, 11/11 da política de senha e o build de produção; segue apenas o aviso conhecido de bundle acima de 500 kB.

## Checkpoint 18 implementado

Partindo das 2.051 linhas deixadas pelo checkpoint 17, o console DEV foi extraído para `src/features/dev/DevConsole.tsx`. O módulo concentra visão geral da plataforma, busca e gestão de tenants, criação e edição de espaços, usuários DEV, modo de teste, identidade visual do console, Evolution API global, backups, indicações e segurança da conta DEV.

Foram preservados endpoints, métodos, payloads, confirmações destrutivas, exclusão definitiva por frase, tratamento de imagens, normalização de telefone, política de senha, estados de assinatura, tema claro/escuro e controles operacionais. O `App.tsx` caiu de 2.051 para 536 linhas, com novo teto arquitetural de 600. As auditorias de arquitetura, indicações, sistema visual, senha, iconografia e segurança agora inspecionam diretamente o módulo DEV quando aplicável. A suíte `npm run check` permaneceu integralmente aprovada, incluindo 44/44 verificações de segurança, 22/22 visuais, 16/16 de iconografia, 12/12 de indicações e o build de produção; segue apenas o aviso conhecido de bundle acima de 500 kB.

## Checkpoint 19 implementado

Partindo das 536 linhas deixadas pelo checkpoint 18, a composição completa do painel ADMIN foi extraída para `src/features/admin/AdminApp.tsx`. O módulo concentra validação da sessão administrativa, gate de aceite dos documentos legais, estado da assinatura e modo de teste, navegação desktop/mobile, Product Tour e composição das áreas de dashboard, agenda, serviços, clientes, financeiro, WhatsApp, Luma, indicações, cobrança, configurações e onboarding.

Foram preservados endpoints, métodos, payloads, redirecionamentos, atualização do tema e tenant, retorno de compra de créditos da Luma, bloqueio por assinatura, logout e estados de carregamento/erro. O `App.tsx` caiu de 536 para 212 linhas, com novo teto arquitetural de 240. As auditorias de arquitetura, onboarding, mobile, Luma, indicações, sistema visual, tema, WhatsApp, UX, legal, segurança e ciclo de agendamentos agora inspecionam diretamente `AdminApp.tsx` quando aplicável. A suíte `npm run check` permaneceu integralmente aprovada, incluindo o build de produção; segue apenas o aviso conhecido de bundle acima de 500 kB.

## Checkpoint 20 implementado

Partindo das 212 linhas deixadas pelo checkpoint 19, a resolução de hosts, descoberta do tenant, metadados públicos, redirecionamento legado de slug e toda a árvore de rotas foram extraídos para `src/app/AppRoutes.tsx`. O `BrowserRouter`, o error boundary, o coordenador de overlays e a central de feedback permanecem no bootstrap global em `src/main.tsx`.

Foram preservados caminhos, fallbacks, rotas legais, detecção dos hosts DEV e raiz, carregamento do tenant por subdomínio, títulos, descrições, Open Graph, canonical, robots e redirecionamentos autenticados. O `App.tsx` caiu de 212 para 5 linhas e agora apenas renderiza `AppRoutes`; o novo módulo possui 213 linhas. Os tetos arquiteturais passaram a ser 20 linhas para `App.tsx` e 240 para `AppRoutes.tsx`. As auditorias arquitetural e legal agora inspecionam diretamente o roteador. A suíte `npm run check` permaneceu integralmente aprovada, incluindo o build de produção; segue apenas o aviso conhecido de bundle acima de 500 kB, que passa a ser o próximo alvo com code splitting por área.

## Checkpoint 21 implementado

Com todas as áreas isoladas até o checkpoint 20, o roteador passou a carregar Landing, autenticação, ADMIN, DEV, booking, Portal da Cliente e documentos legais por `React.lazy`. As duas árvores de rotas usam `Suspense` com um fallback visual e acessível único, preservando a descoberta do tenant e os estados de host antes do carregamento da área solicitada.

O JavaScript inicial de produção caiu de 1.110,96 kB para 268,48 kB, uma redução de aproximadamente 75,8%; após gzip, caiu de 335,25 kB para 85,64 kB. O maior chunk passou a ser o ADMIN, com 405,75 kB, e nenhum arquivo JavaScript permanece acima de 500 kB, eliminando o aviso de chunk excessivo do Vite. O CSS também passou a separar as folhas específicas da Landing e dos documentos legais. A auditoria arquitetural exige agora pelo menos nove fronteiras lazy e o fallback de `Suspense`. A suíte `npm run check` permaneceu integralmente aprovada, incluindo o build de produção com 23 chunks JavaScript/CSS emitidos.

## Checkpoint 22 implementado

Partindo do bundle separado por rotas no checkpoint 21, o painel ADMIN passou a carregar sob demanda as dez áreas de Dashboard, Agenda, Serviços, Clientes, Financeiro, WhatsApp, Luma, Indicações, Assinatura e Configurações. A sessão, o aceite legal, o estado da assinatura, o shell, a navegação e o onboarding permanecem no núcleo administrativo, enquanto cada aba funcional possui seu próprio limite `React.lazy` e compartilha um fallback acessível de `Suspense`.

O chunk `AdminApp` caiu de 405,75 kB para 53,30 kB, uma redução de aproximadamente 86,9%; após gzip, caiu de 124,27 kB para 16,82 kB. O Dashboard inicial passou a 17,88 kB, Agenda a 30,87 kB, WhatsApp a 43,22 kB e Configurações a 41,04 kB. Financeiro, que concentra Chart.js e seus recursos de visualização, tornou-se o maior chunk administrativo isolado com 233,94 kB e só é baixado ao abrir a aba. O `App.tsx` permanece corretamente com 5 linhas, pois este checkpoint trata de entrega de bundle, não de nova redução do arquivo de entrada. A auditoria arquitetural agora exige dez fronteiras lazy internas e seu fallback; a auditoria do WhatsApp também reconhece a importação dinâmica. A suíte `npm run check` permaneceu integralmente aprovada, incluindo 26/26 verificações do WhatsApp e o build de produção sem aviso de chunk excessivo.

## Checkpoint 23 implementado

Partindo das 7.132 linhas deixadas no backend até o checkpoint 22, as oito rotas públicas de tenant, serviços, configurações de booking e disponibilidade foram extraídas para `server/routes/publicRoutes.ts`. O router preserva as variantes resolvidas pelo host e as variantes legadas explícitas por `:slug`, mantendo paths, métodos GET, consultas SQL, ordenação, fallbacks de timezone/moeda/regras, validação de data, códigos de erro e formatos de resposta.

O `server/index.ts` caiu de 7.132 para 6.810 linhas e recebeu um novo teto arquitetural de 6.900; o router público possui 340 linhas. Foi adicionado um teste prático que inicializa Express em porta local temporária com SQLite em memória e percorre tenant, serviços, booking e disponibilidade pelos dois modos de resolução, além do erro `TENANT_NOT_FOUND`. A suíte unitária passou a ter 42 testes, todos aprovados. O contrato arquitetural exige o módulo, a montagem em `/api/public` e as oito rotas registradas.

## Checkpoint 24 implementado

Partindo das 6.810 linhas deixadas pelo checkpoint 23, os 16 endpoints de autenticação profissional foram extraídos para `server/routes/authRoutes.ts`. O módulo concentra identificação da sessão, login ADMIN/DEV, desafio e verificação do WhatsApp OTP, aceite e preferências legais, telefone de MFA, dispositivos confiáveis, sessões ativas, logout individual/global e troca de senha.

A ordem dos limitadores e middlewares de autorização foi preservada, assim como cookies por ambiente, sessão persistente, validações Zod, códigos de erro, eventos de segurança, bloqueios por tenant/host, hashes legais e payloads. O runtime de sessão continua criado uma única vez no bootstrap e é injetado no router; envio de WhatsApp e gravações legais compartilhadas com checkout permanecem funções únicas, sem duplicação. O `server/index.ts` caiu de 6.810 para 6.315 linhas, com novo teto arquitetural de 6.400; o router possui 561 linhas. Um novo teste HTTP local valida sessão anônima e autenticada, proteção de endpoint legal, erro de login fora do tenant e limpeza do cookie no logout. A suíte unitária passou a 43 testes, todos aprovados, e as auditorias arquitetural, segurança, senha e compliance foram adaptadas aos limites do novo módulo.

## Checkpoint 25 implementado

Partindo das 6.315 linhas deixadas pelo checkpoint 24, as 12 rotas DEV de bootstrap, identidade visual da plataforma, usuários DEV e ciclo administrativo de tenants foram extraídas para `server/routes/devCoreRoutes.ts`. A rota pública `/api/public/dev-theme` permaneceu independente no bootstrap, e os blocos DEV de visão geral, indicações, Evolution, modo de teste, notificações e backup ficaram reservados para módulos posteriores.

Foram preservados o bloqueio por host DEV, papéis, limitador persistente de bootstrap, segredo obrigatório em produção, política de senha, normalização de telefone, validação de slug e logo, transação de criação do espaço com configurações, regras e horários iniciais, listagem e edição de tenants, desativação com revogação de sessões e exclusão definitiva condicionada a backup e frase exata. O `server/index.ts` caiu de 6.315 para 5.894 linhas, com novo teto arquitetural de 6.000; o router possui 456 linhas. Um teste HTTP local cobre autorização, gravação da cor DEV, criação completa de tenant, seis horários iniciais, listagem, desativação, exclusão definitiva e auditoria da exclusão. A suíte unitária passou a 44 testes, todos aprovados, e o contrato arquitetural exige a montagem e as 12 rotas do módulo.

## Checkpoint 26 implementado

Partindo das 5.894 linhas deixadas pelo checkpoint 25, as quatro operações gerais da plataforma DEV foram extraídas para `server/routes/devOperationsRoutes.ts`: visão consolidada, modo de teste, notificações de pagamento e exportação de backup. Indicações e Evolution continuam separados deste módulo para preservar limites funcionais claros.

Foram mantidos o bloqueio por host e papel DEV, a proibição do modo de teste em produção, os cálculos dos indicadores dos últimos 30 dias, a leitura tolerante dos payloads históricos de pagamento, a formatação atual das notificações e o limitador dedicado da exportação. O backup continua sendo criado pelo SQLite em arquivo temporário, enviado como download datado e removido tanto após sucesso quanto após falha. O `server/index.ts` caiu de 5.894 para 5.795 linhas, com novo teto arquitetural de 5.850; o módulo possui 132 linhas. Um teste HTTP local valida acesso, métricas, persistência do modo de teste, transformação das notificações e baixa um backup real, confirmando o cabeçalho binário SQLite. A suíte unitária passou a 45 testes, todos aprovados.

## Checkpoint 27 implementado

Partindo das 5.795 linhas deixadas pelo checkpoint 26, as três rotas do programa de indicações DEV foram extraídas para `server/routes/devReferralRoutes.ts`. O módulo concentra visão consolidada, criação de links globais e ativação/desativação, mantendo o cálculo de URLs públicas compartilhado com os demais fluxos de indicação.

Foram preservados host e papel DEV, limitador de mutações, métricas e históricos, confirmação textual obrigatória para 100% de desconto, política automática de uso único e expiração máxima de sete dias, teto da recompensa, datas futuras, token seguro, formatos de resposta e erro para links inexistentes. O `server/index.ts` caiu de 5.795 para 5.734 linhas, com novo teto arquitetural de 5.750; o router possui 92 linhas. Um teste HTTP local valida autorização, rejeição sem `GERAR 100%`, criação do link de cortesia, limite e expiração aplicados, URL pública, métricas e desativação persistida. A suíte unitária passou a 46 testes, todos aprovados, e a auditoria de indicações permaneceu em 12/12.

## Checkpoint 28 implementado

Partindo das 5.734 linhas deixadas pelo checkpoint 27, as cinco rotas da Evolution API Global do console DEV foram extraídas para `server/routes/devEvolutionRoutes.ts`: leitura e atualização da configuração, consulta de estado, conexão ou reconexão e desconexão. O extrator tolerante de QR Code também passou a ser exportado por esse módulo e continua compartilhado com o fluxo WhatsApp do ADMIN, sem duplicação de comportamento.

Foram preservados host e papel DEV, validações Zod, criptografia AES-256-GCM da API key em repouso, nome fixo da instância global, fallback inicial por variáveis de ambiente, normalização e validação DNS de URL HTTPS, bloqueio de redirecionamentos, timeouts, leitura de estado, reinício de instância já conectada, criação com `WHATSAPP-BAILEYS`, nova tentativa de QR Code e todos os códigos e payloads de erro. O `server/index.ts` caiu de 5.734 para 5.562 linhas, com novo teto arquitetural de 5.600; o router possui 215 linhas. Um teste HTTP local valida acesso anônimo e DEV, configuração ausente, rejeição de atualização vazia, gravação criptografada da chave e respostas seguras de status, conexão e desconexão sem chamar rede externa. A suíte unitária passou a 47 testes, todos aprovados, e a auditoria de segurança permaneceu em 44/44.

## Checkpoint 29 implementado

Partindo das 5.562 linhas deixadas pelo checkpoint 28, as quatro rotas administrativas de assinatura e billing foram extraídas para `server/routes/adminBillingRoutes.ts`: pagamento simulado em ambiente seguro, visão geral da assinatura, consulta do estado de pedido e geração de checkout InfinitePay. O checkout público de onboarding, a compra de créditos da Luma e o webhook da operadora permanecem isolados no arquivo de composição para serem movidos em checkpoints específicos, sem ampliar o risco desta etapa.

Foram preservados papel ADMIN, bloqueio do pagamento simulado em produção, renovação anual baseada no período vigente, evento de notificação, catálogo oficial, promoção da primeira mensalidade, limite e reserva de créditos de indicação, expiração das reservas antigas, exigência do host correto em produção, criação e persistência do pedido, URL de retorno e reversão transacional de pedido e créditos quando a operadora falha. O `server/index.ts` caiu de 5.562 para 5.411 linhas, com novo teto arquitetural de 5.450; o router possui 223 linhas. Um teste HTTP local executa o fluxo em SQLite real, validando autorização, ativação simulada, visão geral, pedido pago, criação do checkout, desconto aplicado e reserva persistente do crédito. A suíte unitária passou a 48 testes, todos aprovados; indicações permaneceram em 12/12 e segurança em 44/44.

## Checkpoint 30 implementado

Partindo das 5.411 linhas deixadas pelo checkpoint 29, o checkout público de onboarding foi extraído para `server/routes/publicOnboardingRoutes.ts`. O módulo concentra a validação do cadastro e do aceite legal, aplicação de indicação, criação inicial do espaço, ADMIN, configurações, onboarding, regras e horários, pedido InfinitePay, ativação por cortesia e limpeza da conta provisória quando a operadora falha.

Foram preservados os dois limitadores públicos, política de senha, slug e telefone, versões e hash dos documentos legais, consentimento promocional separado, bloqueio de autoindicação, consumo atômico do link, seis horários iniciais, promoção mensal, desconto calculado apenas no servidor, ativação imediata para pedido zerado, URL de retorno por workspace e rollback de pedido, indicação, tenant e credenciais sem apagar pagamentos confirmados. O `server/index.ts` caiu de 5.411 para 5.306 linhas, com novo teto arquitetural de 5.350; o router possui 178 linhas. Um teste HTTP local valida documento desatualizado, ativação completa por cortesia de 100%, tenant e assinatura ativos, seis horários, pedido e resgate pagos, além da remoção do tenant e das credenciais após falha simulada da operadora. A suíte unitária passou a 49 testes, todos aprovados; indicações permaneceram em 12/12, onboarding em 16/16, compliance legal em 38/38, senha em 11/11 e segurança em 44/44.

## Checkpoint 31 implementado

Partindo das 5.306 linhas deixadas pelo checkpoint 30, o webhook da InfinitePay foi extraído para `server/routes/infinitePayWebhookRoutes.ts`. O módulo concentra validação e hash do evento, confirmação externa do pagamento, idempotência, compra de créditos extras da Luma e ativação de assinaturas, incluindo efeitos de indicação.

Foram preservados o limitador dedicado após o limitador geral de webhooks, rejeição de payload, configuração obrigatória da operadora, valor exato do pedido, higienização da URL de recibo, confirmação via `payment_check`, estados `PENDING`/`PAID`, bloqueio de replay, ledger único da Luma, renovação a partir do período vigente, ativação do tenant, aplicação de créditos reservados, liquidação do resgate e recompensa ao indicador limitada a 30%. O `server/index.ts` caiu de 5.306 para 5.178 linhas, com novo teto arquitetural de 5.225; o router possui 177 linhas. Um teste HTTP local percorre ambos os tipos de pedido e repete cada webhook, comprovando que saldo, assinatura e recompensa não são duplicados. A suíte unitária passou a 50 testes, todos aprovados; indicações permaneceram em 12/12, Luma em 33/33 e segurança em 44/44.

## Checkpoint 32 implementado

Partindo das 5.178 linhas deixadas pelo checkpoint 31, as duas rotas administrativas de compra e consulta dos créditos extras da Luma foram extraídas para `server/routes/adminLumaBillingRoutes.ts`. O módulo também passou a ser a fonte única do catálogo oficial de pacotes e do cálculo do saldo, reutilizados pelo fluxo principal da assistente.

Foram preservados papel ADMIN, exigência do host correto em produção, validação do pacote, identidade do comprador, geração do pedido, descrição comercial, URL de retorno, persistência do checkout, marcação `FAILED` quando a operadora falha, isolamento por tenant e saldo nunca negativo. O `server/index.ts` caiu de 5.178 para 5.107 linhas, com novo teto arquitetural de 5.150; o router possui 113 linhas. Um teste HTTP local em SQLite real valida acesso não autenticado, checkout completo, catálogo e payload enviados à operadora, pedido persistido, consulta com saldo isolado, pedido inexistente e falha simulada da operadora. A suíte unitária passou a 51 testes, todos aprovados; Luma permaneceu em 33/33, segurança em 44/44 e o build de produção foi aprovado.

## Checkpoint 33 implementado

Partindo das 5.107 linhas deixadas pelo checkpoint 32, as três rotas operacionais da assistente administrativa foram extraídas para `server/routes/adminLumaAssistantRoutes.ts`: métricas de uso, envio de mensagem e confirmação de ação pendente. A investigação confirmou que o histórico pesquisável e as conversas são persistidos no cliente e não constituem rotas adicionais do backend; por isso, nenhum contrato inexistente foi artificialmente criado.

Foram preservados autenticação ADMIN, limitador dedicado, disponibilidade por ambiente e provedor, fuso do tenant, contadores diário e mensal, tetos de custo, catálogo e saldo de créditos, validação e limite de imagem, histórico limitado, reserva atômica de orçamento, telemetria completa, consumo de crédito extra, estorno após falha, isolamento de tenant e confirmação explícita das ações preparadas. O `server/index.ts` caiu de 5.107 para 4.916 linhas, com novo teto arquitetural de 4.960; o router possui 262 linhas. Um teste HTTP local em SQLite real valida autorização, métricas, isolamento do saldo, mensagem completa, persistência da telemetria, contexto do tenant, confirmação de ação e falha simulada da IA após o limite diário, comprovando o par consumo/estorno sem perda de crédito. A suíte unitária passou a 52 testes, todos aprovados; Luma permaneceu em 33/33, Financeiro em 24/24, segurança em 44/44 e o build de produção foi aprovado.

## Checkpoint 34 implementado

Partindo das 4.916 linhas deixadas pelo checkpoint 33, o webhook Evolution específico de cada tenant foi extraído para `server/routes/evolutionWebhookRoutes.ts`. O módulo concentra autenticação pelo segredo do webhook, resolução segura de tenant e instância, auditoria por hash, recebimento de mensagens, opt-out promocional, atualização de entrega, estado de conexão e encaminhamento das respostas de confirmação de presença.

Foram preservados ACK positivo mesmo diante de erro interno para evitar tempestades de retry do provedor, rejeição sem segredo, validação UUID do tenant, isolamento conjunto por `instance_name` e `tenant_id`, deduplicação delegada ao inbox, descarte de grupos, suporte a mensagens inbound e outbound, confirmação do opt-out, progressão monotônica `SENT`/`DELIVERED`/`READ`, atualização do último webhook, confirmações automáticas e auditoria redigida sem armazenar o payload bruto. O `server/index.ts` caiu de 4.916 para 4.817 linhas, com novo teto arquitetural de 4.860; o router possui 175 linhas. Um teste HTTP local em SQLite real valida segredo obrigatório, instância desconhecida, opt-out, mensagem persistida, recibo de leitura, conexão, confirmação, grupo ignorado, erro interno com ACK e tenant inválido. A suíte unitária passou a 53 testes, todos aprovados; WhatsApp permaneceu em 26/26, ciclo de agendamentos em 36/36, segurança em 44/44 e o build de produção foi aprovado.

## Checkpoint 35 implementado

Partindo das 4.817 linhas deixadas pelo checkpoint 34, as quatro rotas administrativas de serviços foram extraídas para `server/routes/adminServicesRoutes.ts`: listagem ativa, criação, edição e exclusão lógica.

Foram preservados autenticação ADMIN, capas de até 350.000 caracteres, nome, duração, preço em centavos, ordenação de serviços ativos, remoção de capa, bloqueio de atualização vazia, ativação padrão e exclusão por `active = 0`. Todas as leituras e mutações permanecem isoladas por `tenant_id`, inclusive a leitura de retorno após criação ou edição. O `server/index.ts` caiu de 4.817 para 4.697 linhas, com novo teto arquitetural de 4.740; o router possui 111 linhas. Um teste HTTP local em SQLite real valida autenticação, listagem sem itens inativos ou de outro tenant, criação com capa, edição completa, remoção da capa, rejeição de payload vazio, bloqueio de edição e exclusão entre tenants e exclusão lógica. A suíte unitária passou a 54 testes, todos aprovados; WhatsApp permaneceu em 26/26, ciclo de agendamentos em 36/36, segurança em 44/44 e o build de produção foi aprovado.

Próximo checkpoint recomendado: extrair as rotas administrativas de agenda e agendamentos, preservando filtros, disponibilidade, duração do serviço, conflito de horário, ciclo de presença e isolamento por tenant.

## Checkpoint 36 implementado

Partindo das 4.697 linhas deixadas pelo checkpoint 35, as sete rotas administrativas de agendamentos foram extraídas para `server/routes/adminAppointmentsRoutes.ts`: listagem filtrada, criação manual, alteração de status, reenvio de confirmação, confirmação manual, histórico de confirmação e exclusão.

Foram preservados autenticação ADMIN, filtros por período e limite, duração derivada do serviço, reaproveitamento da cliente pelo telefone normalizado, criação transacional de novas clientes, detecção de conflito com horários ativos, respeito a bloqueios da agenda, estados `PENDING`/`CONFIRMED`/`CANCELLED`, agendamento e cancelamento das automações, reenvio por WhatsApp, presença confirmada manualmente e histórico de eventos. Consultas, alterações de status, eventos e exclusões permanecem isolados por `tenant_id`, incluindo a leitura de retorno após mutação. O `server/index.ts` caiu de 4.697 para 4.367 linhas, com novo teto arquitetural de 4.410; o router possui 297 linhas. Um teste HTTP local em SQLite real valida autenticação, filtros, isolamento da listagem, duração calculada, atualização de cliente existente, criação de nova cliente, conflitos de horário e bloqueio, impedimento de mutações entre tenants, cancelamento, reenvio, confirmação manual, histórico e exclusão. A suíte unitária passou a 55 testes, todos aprovados; WhatsApp permaneceu em 26/26, ciclo de agendamentos em 36/36, segurança em 44/44 e o build de produção foi aprovado.

Próximo checkpoint recomendado: extrair horários comerciais e bloqueios de agenda para um módulo administrativo próprio, preservando validação de intervalos, recorrência semanal, conflitos e isolamento por tenant.

## Checkpoint 37 implementado

Partindo das 4.367 linhas deixadas pelo checkpoint 36, as oito rotas administrativas de disponibilidade foram extraídas para `server/routes/adminAvailabilityRoutes.ts`: listagem, criação, edição e exclusão de horários comerciais semanais, além da listagem filtrada, criação, edição e exclusão de bloqueios de agenda.

Foram preservados autenticação ADMIN, ordenação semanal, limites de dia e minutos, validação de intervalos, bloqueio de sobreposição entre horários, filtros por período e limite, motivo opcional, bloqueio de sobreposição entre indisponibilidades e conflito com agendamentos `PENDING` ou `CONFIRMED`. Leituras, verificações, atualizações e exclusões continuam isoladas por `tenant_id`; agendamentos cancelados não impedem a criação de bloqueios. O `server/index.ts` caiu de 4.367 para 3.965 linhas, com novo teto arquitetural de 4.010; o router possui 291 linhas. Um teste HTTP local em SQLite real valida autenticação, ordenação e isolamento das listagens, intervalos adjacentes, rejeição de sobreposição, atualização vazia, conflitos com atendimento, normalização do motivo, impedimento de edição e exclusão entre tenants e exclusões válidas. A suíte unitária passou a 56 testes, todos aprovados; WhatsApp permaneceu em 26/26, ciclo de agendamentos em 36/36, segurança em 44/44 e o build de produção foi aprovado.

Próximo checkpoint recomendado: extrair o dashboard administrativo e suas métricas para um router próprio, preservando períodos, fuso horário, indicadores financeiros e isolamento por tenant.

## Checkpoint 38 implementado

Partindo das 3.965 linhas deixadas pelo checkpoint 37, a rota de leitura do dashboard administrativo foi extraída para `server/routes/adminDashboardRoutes.ts`. O módulo reúne apenas a composição das métricas e mantém o bootstrap do servidor livre das consultas do painel.

Foram preservados autenticação ADMIN, fuso horário do tenant, limites civis do dia, quantidade de atendimentos e receita prevista, novas clientes em 30 dias, pendências futuras, resumo diário das confirmações, exceções dos próximos sete dias, próximos atendimentos sem cancelados, atividade recente de agendamentos e despesas e domínio público principal. Todas as consultas continuam isoladas por `tenant_id`; domínio, clientes, serviços e movimentações de outro tenant não aparecem no resultado. O `server/index.ts` caiu de 3.965 para 3.752 linhas, com novo teto arquitetural de 3.800; o router possui 205 linhas. Um teste HTTP local em SQLite real, com relógio controlado, valida todos os indicadores, intervalos, ordenação, domínio ativo, exclusão de cancelados, isolamento multi-tenant e rejeição de fuso inválido. A suíte unitária passou a 57 testes, todos aprovados; ciclo de agendamentos permaneceu em 36/36, WhatsApp em 26/26, segurança em 44/44 e o build de produção foi aprovado.

Próximo checkpoint recomendado: extrair as configurações administrativas de identidade do tenant e o gerenciamento de domínios personalizados para um módulo próprio.

## Checkpoint 39 implementado

Partindo das 3.752 linhas deixadas pelo checkpoint 38, as seis rotas administrativas de identidade e domínios foram extraídas para `server/routes/adminTenantSettingsRoutes.ts`: atualização da marca do espaço, listagem e cadastro de domínios, verificação DNS, definição do domínio principal e exclusão.

Foram preservados autenticação ADMIN, nome, cor principal, logo por data URL ou HTTPS, remoção de logo, rejeição de atualização vazia, normalização IDNA do domínio, bloqueio de endereços reservados, limite de cinco domínios, unicidade global, token TXT seguro, limitador dedicado antes da autenticação na verificação, exigência de domínio ativo para torná-lo principal e troca transacional do principal. O runtime DNS permanece único e compartilhado com o worker periódico e a autorização interna, sem duplicação de regras. Todas as leituras e mutações continuam isoladas por `tenant_id`. O `server/index.ts` caiu de 3.752 para 3.556 linhas, com novo teto arquitetural de 3.600; o router possui 207 linhas. Um teste HTTP local em SQLite real valida identidade, logo inválida, tenant inexistente, listagem isolada, domínio reservado e ocupado, normalização, token, limite, ordem dos middlewares, verificação, ativação, domínio principal e bloqueio de operações entre tenants. A suíte unitária passou a 58 testes, todos aprovados; ciclo de agendamentos permaneceu em 36/36, WhatsApp em 26/26, segurança em 44/44 e o build de produção foi aprovado.

Próximo checkpoint recomendado: extrair a listagem administrativa de clientes e seus agregados de gasto e última visita para um módulo próprio.

## Checkpoint 40 implementado

Partindo das 3.556 linhas deixadas pelo checkpoint 39, a listagem administrativa de clientes foi extraída para `server/routes/adminClientsRoutes.ts`, incluindo os agregados usados pelas versões desktop e mobile do painel.

Foram preservados autenticação ADMIN, nome, telefone, e-mail, consentimento promocional do WhatsApp, total gasto e última visita. O cálculo continua contabilizando agendamentos com status `CONFIRMED` ou presença `CONFIRMED`/`MANUALLY_CONFIRMED`, ignorando cancelamentos e pendências sem confirmação. A ordenação mantém clientes com visita antes das clientes ainda sem histórico, priorizando a visita mais recente e depois o maior valor acumulado. A consulta e todos os joins permanecem isolados por `tenant_id`, com limite de 500 registros. O `server/index.ts` caiu de 3.556 para 3.517 linhas, com novo teto arquitetural de 3.560; o router possui 52 linhas. Um teste HTTP local em SQLite real valida autorização, todas as combinações de status e presença, soma correta, última visita, consentimento, ordenação, cliente sem atendimento e isolamento entre tenants. A suíte unitária passou a 59 testes, todos aprovados; consentimento permaneceu em 16/16, ciclo de agendamentos em 36/36, segurança em 44/44 e o build de produção foi aprovado.

Próximo checkpoint recomendado: extrair as rotas administrativas do financeiro, preservando fuso horário, metas, indicadores, transações, despesas e exportação do extrato.

## Checkpoint 41 implementado

Partindo das 3.517 linhas deixadas pelo checkpoint 40, as seis rotas administrativas do financeiro foram extraídas para `server/routes/adminFinanceRoutes.ts`: visão geral, atualização de metas, lançamento rápido de despesa, movimentação manual, exclusão de movimentação e extrato filtrado.

Foram preservados autenticação ADMIN, fuso horário do tenant, metas, totais históricos, visão mensal, categorias de despesa, novas clientes, receitas de atendimentos com presença confirmada, entradas e despesas manuais, normalização de método e observação, conversão de data civil para o meio-dia local, intervalos civis com fim exclusivo e filtros do extrato. Consultas, atualizações, lançamentos e exclusões continuam isolados por `tenant_id`; registros de outro tenant não aparecem e não podem ser removidos. O `server/index.ts` caiu de 3.517 para 3.177 linhas físicas, com novo teto arquitetural de 3.220; o router possui 364 linhas físicas. O auditor arquitetural registra 3.178 e 365 porque contabiliza o segmento após a última quebra de linha. Um teste HTTP local em SQLite real, com relógio controlado, valida autorização, indicadores, presença confirmada, metas, despesas, receitas, data civil, extrato por tipo e período, rejeição de intervalo invertido, exclusão e isolamento multi-tenant. A suíte unitária passou a 60 testes, todos aprovados; Financeiro permaneceu em 24/24, ciclo de agendamentos em 36/36, segurança em 44/44, e a esteira integral e o build de produção foram aprovados.

Próximo checkpoint recomendado: extrair a configuração e as preferências administrativas do WhatsApp para um router próprio, preservando criptografia de segredo, conexão Evolution, confirmação automática e isolamento por tenant.

## Checkpoint 42 implementado

Partindo das 3.177 linhas físicas deixadas pelo checkpoint 41, as quatro rotas administrativas de configuração e preferências do WhatsApp foram extraídas para `server/routes/adminWhatsappSettingsRoutes.ts`: consulta e atualização da instância Evolution, além da consulta e atualização das regras de confirmação, lembrete e promoção.

Foram preservados autenticação ADMIN, criação automática da instância gerenciada pela plataforma, ausência de segredo na resposta, criptografia da chave específica do tenant, validação HTTPS, retenção de valores não alterados, bloqueio da troca de URL e credencial pelo ADMIN em produção, mensagens padrão, limites de horas, validação da janela de confirmação e reenvio, normalização das mensagens e reprogramação das automações após salvar. Leituras e mutações continuam isoladas por `tenant_id`. O `server/index.ts` caiu de 3.177 para 2.954 linhas físicas, com novo teto arquitetural de 3.000; o router possui 236 linhas físicas. O auditor arquitetural registra 2.955 e 237 porque contabiliza o segmento após a última quebra de linha. Um teste HTTP local em SQLite real, com relógio controlado, valida autorização, ausência inicial, criação e atualização da instância, segredo cifrado e nunca exposto, modo gerenciado, defaults, janelas inválidas, criação e atualização parcial das preferências, reprogramação e isolamento multi-tenant. A suíte unitária passou a 61 testes, todos aprovados; WhatsApp permaneceu em 26/26, ciclo de agendamentos em 36/36, segurança em 44/44, e a esteira integral e o build de produção foram aprovados.

Próximo checkpoint recomendado: extrair as rotas administrativas de conexão e diagnóstico do WhatsApp, preservando estado da instância, criação e leitura do QR Code, webhook e telemetria por tenant.

## Checkpoint 43 implementado

Partindo das 2.954 linhas físicas deixadas pelo checkpoint 42, as três rotas administrativas de conexão e diagnóstico do WhatsApp foram extraídas para `server/routes/adminWhatsappConnectionRoutes.ts`: estado da instância, provisionamento e leitura do QR Code e diagnóstico operacional.

Foram preservados autenticação ADMIN, resolução HTTPS validada da Evolution, chave apenas no header da operadora, estado bruto retornado ao frontend, normalização interna da conexão, atualização da saúde persistida, preparação do webhook ao conectar, criação da instância quando o QR ainda não existe, nova tentativa de leitura, erro público controlado quando o provisionamento falha e diagnóstico consolidado de webhook, entradas, saídas, audiência consentida, saúde, reconexões e último evento recebido. Todas as consultas e atualizações permanecem isoladas por `tenant_id`, inclusive nome da instância, mensagens, clientes e telemetria. O `server/index.ts` caiu de 2.954 para 2.836 linhas físicas, com novo teto arquitetural de 2.880; o router possui 192 linhas físicas. O auditor arquitetural registra 2.837 e 193 porque contabiliza o segmento após a última quebra de linha. Um teste HTTP local em SQLite real e operadora Evolution simulada valida autorização, ausência de configuração, estado conectado, header e URL codificada, webhook, QR direto, provisionamento, payload de criação, falha da operadora, diagnóstico completo e isolamento multi-tenant. A suíte unitária passou a 62 testes, todos aprovados; WhatsApp permaneceu em 26/26, ciclo de agendamentos em 36/36, segurança em 44/44, e a esteira integral e o build de produção foram aprovados.

Próximo checkpoint recomendado: extrair as rotas administrativas de campanhas do WhatsApp, preservando consentimento, audiência, fila persistente, cancelamento e bloqueio do broadcast legado.

## Checkpoint 44 implementado

Partindo das 2.836 linhas físicas deixadas pelo checkpoint 43, as quatro rotas administrativas de campanhas do WhatsApp foram extraídas para `server/routes/adminWhatsappCampaignRoutes.ts`: histórico e metadados operacionais, criação da campanha consentida, cancelamento e bloqueio explícito do broadcast legado.

Foram preservados autenticação ADMIN, feature flag desativada por padrão, exigência do modelo promocional, audiência formada somente por clientes com opt-in explícito e telefone, limite operacional por campanha, bloqueio de campanhas simultâneas, instrução de opt-out adicionada à mensagem, criação transacional da campanha e de sua fila persistente, cancelamento restrito ao tenant e mudança para `SKIPPED` somente dos destinatários ainda pendentes. O endpoint legado continua impedido de contornar fila e consentimento. O worker permaneceu no runtime atual e continua revalidando consentimento imediatamente antes de cada envio. O `server/index.ts` caiu de 2.836 para 2.706 linhas físicas, com novo teto arquitetural de 2.750; o router possui 217 linhas físicas. O auditor arquitetural registra 2.707 e 218 porque contabiliza o segmento após a última quebra de linha. Um teste HTTP local em SQLite real, com relógio controlado, valida autorização, feature flag, modelo promocional, audiência vazia, limite, opt-in, isolamento multi-tenant, persistência da fila, campanha simultânea, cancelamento parcial e bloqueio do broadcast legado. A suíte unitária passa a 63 testes; WhatsApp permanece em 26/26, consentimento em 16/16, legal/compliance em 38/38 e segurança em 44/44.

Próximo checkpoint recomendado: extrair as rotas administrativas de conversas, contatos e mensagens do WhatsApp, preservando limitadores, preparação do webhook, envio, mídia privada, leitura e isolamento por tenant.

## Checkpoint 45 implementado

Partindo das 2.706 linhas físicas deixadas pelo checkpoint 44, as seis rotas administrativas de conversas e mensagens do WhatsApp foram extraídas para `server/routes/adminWhatsappConversationRoutes.ts`: início de conversa e envio manual, listagem e busca de conversas, histórico de mensagens, leitura de mídia privada, marcação como lida e resposta dentro da conversa.

Foram preservados autenticação ADMIN antes do limitador de envio, preparação do webhook ao iniciar conversas manuais, validação de nome, telefone e texto, opção de não registrar a mensagem na caixa de entrada, agregados de cliente e próximo agendamento, busca sem curingas SQL fornecidos pelo usuário, ordem cronológica das mensagens, limite de 120 itens, leitura de mídia apenas inbound e pronta, resolução segura do caminho privado, conferência do tamanho armazenado, headers contra interpretação indevida, limpeza do nome do arquivo, contagem de não lidas e todos os filtros por `tenant_id`. As rotas continuam usando as funções únicas de envio e persistência compartilhadas com webhook, automações e campanhas, sem duplicar essas regras. O `server/index.ts` caiu de 2.706 para 2.534 linhas físicas, com novo teto arquitetural de 2.580; o router possui 234 linhas físicas. O auditor arquitetural registra 2.535 e 235 porque contabiliza o segmento após a última quebra de linha. Um teste HTTP local em SQLite real e diretório temporário de mídia valida autorização, busca, agregados, ordenação, envio, falha da operadora, preparação do webhook, limitador, mídia e headers, leitura e isolamento multi-tenant. A suíte unitária passa a 64 testes; WhatsApp permanece em 26/26, segurança em 44/44 e os testes de primitivas do WhatsApp em 35/35.

Próximo checkpoint recomendado: extrair as rotas públicas e administrativas de indicações, preservando tokens, descontos, limites, métricas, expiração e isolamento por tenant.

## Checkpoint 46 implementado

Partindo das 2.534 linhas físicas deixadas pelo checkpoint 45, as três rotas públicas e administrativas de indicações foram extraídas para `server/routes/referralRoutes.ts`: consulta pública de link, visão geral ADMIN e criação ou reutilização do link do tenant. Os routers público e administrativo permanecem separados para conservar suas posições distintas na composição do Express.

Foram preservados validação e tamanho do token, link ativo, limite de resgates, expiração comparada no servidor, resposta pública mínima, autenticação ADMIN, proteção global de assinatura, ordem original do limitador antes da autenticação na mutação, último link do tenant, métricas de resgates pagos, economia concedida, histórico de créditos, regras oficiais de 15% e 10%, reutilização idempotente do link ativo, geração criptográfica do token no runtime, limite de 100.000 usos e rótulo derivado do nome do espaço. Consultas, métricas, créditos, reutilização e criação continuam isolados por `owner_tenant_id`. O `server/index.ts` caiu de 2.534 para 2.474 linhas físicas, com novo teto arquitetural de 2.520; o módulo possui 138 linhas físicas. O auditor arquitetural registra 2.475 e 139 porque contabiliza o segmento após a última quebra de linha. Um teste HTTP local em SQLite real e relógio controlado valida link público ativo, expirado, esgotado e inexistente, autorização, ordem do limitador, métricas pagas, créditos, regras, reutilização, criação e isolamento multi-tenant. A suíte unitária passa a 65 testes; indicações permanece em 12/12, onboarding em 16/16 e segurança em 44/44.

Próximo checkpoint recomendado: extrair as rotas administrativas de onboarding e configuração inicial, preservando sugestões assistidas, fallback curado, marca, horários, serviços, transação, conclusão, skip e isolamento por tenant.

## Checkpoint 47 implementado

Partindo das 2.474 linhas físicas deixadas pelo checkpoint 46, as quatro rotas administrativas de onboarding e configuração inicial foram extraídas para `server/routes/adminOnboardingRoutes.ts`: estado do onboarding, sugestões visuais, conclusão e skip.

Foram preservados autenticação ADMIN, posição após a proteção global de assinatura, ordem do limitador de análise antes da autenticação, flag e modelo visual expostos ao frontend, fallback curado com três direções de paleta, análise opcional pela IA, limite persistente de três tentativas por tenant, registro de uso e custo somente em respostas bem-sucedidas, fallback seguro em falhas da operadora, validação e limite da logo, modo assistido ou manual, cores hexadecimais, dias e horários, intervalo válido, catálogo inicial e respostas estruturadas. A conclusão continua transacional: atualiza a marca, substitui horários sem duplicar dias, cria os serviços iniciais somente quando não existe serviço ativo e conclui o onboarding como uma unidade. O skip continua afetando apenas onboarding pendente do tenant atual. O `server/index.ts` caiu de 2.474 para 2.366 linhas físicas, com novo teto arquitetural de 2.410; o router possui 217 linhas físicas. O auditor arquitetural registra 2.367 e 218 porque contabiliza o segmento após a última quebra de linha. Um teste HTTP local em SQLite real e relógio controlado valida autorização, ordem do limitador, fallback sem IA, análise bem-sucedida, contabilização, falha controlada, limite, logos, intervalo, marca, cores, horários, catálogo sem duplicação, respostas, conclusão, skip e isolamento multi-tenant. A suíte unitária passa a 66 testes; onboarding permanece em 16/16, UX em 18/18 e segurança em 44/44.

Próximo checkpoint recomendado: extrair a criação pública de agendamentos, preservando resolução por host ou slug, limitadores, cadastro da cliente, conflitos, consentimento opcional e transação do horário.

## Checkpoint 48 implementado

Partindo das 2.366 linhas físicas deixadas pelo checkpoint 47, as duas rotas de criação pública de agendamentos foram extraídas para `server/routes/publicBookingRoutes.ts`: criação pelo host já resolvido e criação pelo slug explícito do espaço.

Foram preservados os limitadores por origem e por telefone na ordem original, normalização e validação do slug, bloqueio de divergência entre host e slug, exigência de tenant ativo, schema estrito, cadastro ou reuso da cliente por telefone dentro do tenant, proteção da identidade já verificada, prevenção transacional de identidades paralelas, senha aleatória derivada, criação centralizada do horário, conflitos e regras de disponibilidade, opt-in opcional e registro do consentimento somente depois do sucesso do agendamento. A regra compartilhada `createAppointmentForUser` permanece no runtime por ainda atender também o portal autenticado da cliente. O `server/index.ts` caiu de 2.366 para 2.311 linhas físicas, com novo teto arquitetural de 2.355; o router possui 141 linhas físicas. O auditor arquitetural registra 2.312 e 142 porque contabiliza o segmento após a última quebra de linha. Um teste HTTP local em SQLite real e relógio controlado valida ausência de tenant, host resolvido, slug normalizado, divergência host/slug, tenant inativo, cliente existente, nova cliente, identidade imutável, reuso, conflito, consentimento, schema estrito, ordem dos limitadores e isolamento multi-tenant. A suíte unitária passa a 67 testes; ciclo de agendamentos permanece em 36/36, experiência da cliente em 25/25, consentimento em 16/16 e segurança em 44/44.

Próximo checkpoint recomendado: extrair o acesso público passwordless e as rotas autenticadas do portal da cliente, preservando OTP, respostas resistentes a enumeração, sessão persistente, preferências de marketing, histórico, criação de horários e isolamento por tenant.

## Checkpoint 49 implementado

Partindo das 2.311 linhas físicas deixadas pelo checkpoint 48, os seis endpoints de acesso e portal da cliente foram extraídos para `server/routes/clientPortalRoutes.ts`. O módulo exporta dois routers para conservar as bases distintas: solicitação e verificação pública do OTP em `/api/public`, e preferências de marketing, histórico e criação autenticada de agendamentos em `/api/client`.

Foram preservados os limitadores persistentes e sua ordem, slug e telefone normalizados, exigência da configuração do WhatsApp, resposta genérica contra enumeração de telefones, invalidação dos códigos anteriores, OTP criptograficamente aleatório de seis dígitos, hash separado por tenant e usuário, validade de cinco minutos, bloqueio após cinco tentativas, comparação em tempo constante, consumo único e sessão persistente após verificação. No portal foram preservados papel `CLIENT`, tenant da sessão, leitura e retirada do consentimento, trilha pela função central de consentimento, histórico limitado e ordenado, confirmação separada do status bruto, criação pela mesma regra central usada no booking público e isolamento por tenant e usuário. O `server/index.ts` caiu de 2.311 para 2.168 linhas físicas, com novo teto arquitetural de 2.210; o módulo possui 223 linhas físicas. O auditor arquitetural registra 2.169 e 224 porque contabiliza o segmento após a última quebra de linha. Um teste HTTP local em SQLite real valida tenant inexistente, WhatsApp indisponível, resposta indistinguível para telefone desconhecido, ordem dos limitadores, invalidação, envio, código incorreto, expiração, limite de tentativas, uso único, sessão persistente, autorização por papel, sessão sem tenant, schema estrito, consentimento, ordenação do histórico, criação compartilhada e isolamento multi-tenant. A suíte unitária passa a 68 testes; experiência da cliente permanece em 25/25, consentimento em 16/16, ciclo de agendamentos em 36/36 e segurança em 44/44.

Próximo checkpoint recomendado: extrair os endpoints operacionais e públicos restantes da plataforma — health, readiness, autorização interna de domínio, tema DEV, documentos legais e planos — preservando segredo interno, resolução de host, cache, contratos públicos e ordem dos middlewares.

## Checkpoint 50 implementado

Partindo das 2.168 linhas físicas deixadas pelo checkpoint 49, os seis endpoints operacionais e públicos restantes foram extraídos para `server/routes/platformRoutes.ts`: health, readiness, autorização interna de domínio, tema do console DEV, documentos legais e catálogo público de planos. O módulo expõe quatro factories e mantém seus pontos de montagem separados, preservando a posição original de cada grupo em relação aos routers públicos, de autenticação e DEV.

Foram preservados versão do serviço, sondagem real do SQLite e resposta 503 de indisponibilidade, restrição da autorização de domínio a loopback, ausência de segredo como 503, comparação segura do segredo, normalização estrita do domínio, autorização do hostname principal, host DEV, subdomínio somente de tenant ativo e domínio personalizado somente quando domínio e tenant estão ativos. Também permanecem a proteção do tema pelo host DEV, cor nula quando não configurada, documento legal canônico gerado no servidor e catálogo oficial com provedor InfinitePay e métodos PIX e cartão. O `server/index.ts` caiu de 2.168 para 2.097 linhas físicas, com novo teto arquitetural de 2.140; o módulo possui 130 linhas físicas. O auditor arquitetural registra 2.098 e 131 porque contabiliza o segmento após a última quebra de linha. Um teste HTTP local em SQLite real valida health, readiness saudável e indisponível, configuração ausente, segredo incorreto, domínio inválido, hostname principal, host DEV, subdomínios ativos e inativos, domínios personalizados ativos, pendentes e vinculados a tenant suspenso, proteção do tema, conteúdo legal e contrato comercial dos planos. A suíte unitária passa a 69 testes; segurança permanece em 44/44 e legal/compliance em 38/38.

Próximo checkpoint recomendado: extrair o verificador periódico de domínios para um runtime próprio, preservando fila de pendentes e erros, revalidação de domínios ativos, limites por lote, intervalos, transições de estado e tolerância a falhas temporárias de DNS.

## Checkpoint 51 implementado

Partindo das 2.097 linhas físicas deixadas pelo checkpoint 50, o verificador periódico de domínios foi extraído para `server/domainVerificationRuntime.ts`. O runtime agora concentra consulta por tenant, verificação individual, fila periódica, limitação do lote, trava contra execuções sobrepostas, bootstrap atrasado, intervalo recorrente e encerramento dos dois timers.

Foram preservados o token criptograficamente aleatório, a verificação DNS centralizada, a prioridade de domínios `PENDING` e `ERROR`, a revalidação menos frequente de domínios `ACTIVE`, o lote padrão de 25 itens, os intervalos configuráveis, o primeiro `verified_at`, as transições para `ACTIVE`, `PENDING` e `ERROR`, o isolamento por tenant, o registro de `last_checked_at` e a mensagem de erro limitada a 500 caracteres. O desligamento passou também a cancelar explicitamente o bootstrap de dez segundos, impedindo trabalho atrasado depois do fechamento do banco. O `server/index.ts` caiu de 2.097 para 2.010 linhas físicas, com novo teto arquitetural de 2.050; o runtime possui 177 linhas físicas. O auditor arquitetural registra 2.011 e 178 porque contabiliza o segmento após a última quebra de linha. Um teste em SQLite real, com relógio, DNS e agendador controlados, valida seleção por vencimento, prioridade, limite do lote, estados, preservação da primeira verificação, falhas temporárias, isolamento, concorrência, idempotência do start, configuração dos timers e shutdown. A suíte unitária passa a 70 testes; domínios e segurança permanecem integralmente aprovados.

Próximo checkpoint recomendado: extrair o worker de saúde das conexões WhatsApp para um runtime próprio, preservando configuração por tenant, reconciliação de estado, timestamps, tolerância a falhas, trava de execução, timers e shutdown.

## Checkpoint 52 implementado

Partindo das 2.010 linhas físicas deixadas pelo checkpoint 51, os três workers operacionais do WhatsApp foram extraídos em conjunto para `server/whatsappWorkerRuntime.ts`: saúde e reconexão das instâncias Evolution, download e armazenamento privado de mídias recebidas e processamento consentido das campanhas promocionais. Este checkpoint adota lotes maiores por subsistema: funções com o mesmo ciclo de vida são movidas juntas, mas continuam protegidas por testes de caracterização e pelo gate integral.

Foram preservados os limites de 60 instâncias e 12 mídias por rodada, travas independentes contra sobreposição, normalização dos estados Evolution, backoff e lease de reconexão, limite de tentativas, resolução segura da URL externa, timeouts, ausência de redirects, download máximo de 8 MB, nomes e caminhos privados validados, permissões de diretório e arquivo, retentativa de mídia, recuperação exclusiva de claims vencidos, revalidação do consentimento imediatamente antes do envio, substituição das variáveis da campanha, captura do identificador do provedor, contadores transacionais e conclusão da campanha. O runtime centraliza três intervalos e três bootstraps, mantendo os atrasos originais, `unref`, start idempotente e cancelamento integral no shutdown. O `server/index.ts` caiu de 2.010 para 1.730 linhas físicas, com novo teto arquitetural de 1.780; o runtime possui 377 linhas físicas. O auditor registra 1.731 e 378 porque contabiliza o segmento após a última quebra de linha.

Quatro testes locais adicionais, usando SQLite real, relógio e Evolution controlados e escrita efetiva em diretório temporário, validam conexão saudável, reconexão, single-flight, mídia privada, ausência de configuração, consentimento no envio, conclusão da campanha e os seis timers. A suíte unitária passa de 70 para 74 testes, com TypeScript, lint, contrato arquitetural e build preservados.

Próximo checkpoint recomendado, também em lote coeso: extrair o runtime completo de automações de agendamento — criação e cancelamento dos jobs, envio e reenvio de confirmação, lembretes, cutoff, lease, fila periódica, timers e shutdown — preservando estados, idempotência e transações.

## Checkpoint 53 implementado

Partindo das 1.730 linhas físicas deixadas pelo checkpoint 52, o runtime completo de automações de agendamento foi extraído para `server/appointmentAutomationRuntime.ts`. A extração reúne consulta do horário e da cliente, formatação local, templates, trilha de eventos, confirmação inicial, reenvio, lembrete, criação idempotente e cancelamento seletivo dos jobs, reconciliação de segurança, claim transacional, lease, backoff, falha terminal, processamento do lote, timers e shutdown.

Foram preservados os quatro tipos de job, chave idempotente por horário e tipo, reativação somente de jobs pendentes ou cancelados, isolamento por tenant, bloqueio de horários cancelados ou passados, janela mínima de quinze minutos, horizonte reconciliador de oito dias, limite de mil horários na reconfiguração do tenant e trezentos na reconciliação, lote de trinta jobs, lease de dez minutos, máximo de cinco tentativas, backoff exponencial limitado a sessenta minutos, configuração prévia do webhook, remoção do código legado das mensagens novas, captura do identificador do provedor, transições de presença separadas do status bruto, cutoff sem resposta e lembrete somente para presença confirmada. O runtime possui trava single-flight, start idempotente e cancela intervalo e bootstrap no shutdown.

O `server/index.ts` caiu de 1.730 para 1.398 linhas físicas, com novo teto arquitetural de 1.440; o runtime possui 449 linhas físicas. O auditor registra 1.399 e 450 porque contabiliza o segmento após a última quebra de linha. Cinco testes locais adicionais em SQLite real e relógio controlado validam os quatro jobs e seus horários, idempotência, isolamento, cancelamento, confirmação única, ausência de código legado, concorrência, recuperação de lease, quinta tentativa terminal, eventos, cutoff, lembrete, timers e shutdown. A suíte unitária passa de 74 para 79 testes; o contrato do ciclo de agendamentos permanece em 36/36.

Próximo checkpoint recomendado em lote: extrair o núcleo de integração WhatsApp/Evolution por tenant — resolução segura da configuração, conversas e persistência de mensagens, envio, estado da conexão, webhook, parser inbound e tratamento das respostas de confirmação — preservando criptografia, isolamento, deduplicação e SSRF protection.

## Checkpoint 54 implementado

Partindo das 1.398 linhas físicas deixadas pelo checkpoint 53, o núcleo completo da integração WhatsApp/Evolution por tenant foi extraído para `server/whatsappEvolutionRuntime.ts`. O runtime concentra resolução da configuração local ou gerenciada, descriptografia contextual dos segredos, criação segura da instância do tenant, preferências de automação, normalização do contato, conversas, mensagens, deduplicação, consentimento promocional, envio, captura do identificador do provedor, estado da conexão, configuração e diagnóstico do webhook, parser inbound e respostas de confirmação de presença.

Foram preservados o isolamento conjunto por tenant e instância, preferência obrigatória pela configuração global em produção, ciphertext original sem exposição, nomes determinísticos de instância, resolução HTTPS protegida contra SSRF antes de cada chamada Evolution, bloqueio de redirects, timeouts, segredo do webhook, três eventos necessários, payload sem base64, deduplicação por `provider_message_id` dentro do tenant, janela de oito segundos quando o provedor não retorna identificador, fila de mídia recebida, consentimento imediatamente antes do envio promocional, auditoria de concessão e retirada, suporte a `remoteJidAlt` e `@lid`, descarte de grupos pelo router, respostas citadas, código legado apenas como fallback, ambiguidade explícita e confirmação ou recusa sem misturar presença com o status bruto do horário.

O `server/index.ts` caiu de 1.398 para 835 linhas físicas, redução de 563 linhas, com novo teto arquitetural de 880; o runtime possui 475 linhas físicas. O auditor registra 836 linhas no index por sua convenção de contagem do segmento final. Cinco testes adicionais em SQLite real, relógio e Evolution controlados validam configuração local e gerenciada, criação isolada da instância, passagem obrigatória pela resolução HTTPS, contrato do webhook, deduplicação por tenant, fila de mídia, vínculo com a cliente, consentimento promocional, persistência do envio, parser `@lid`, resposta citada e confirmação restrita ao tenant esperado. A suíte unitária passa de 79 para 84 testes; arquitetura, agendamentos, WhatsApp, segurança e consentimento permanecem integralmente aprovados.

Próximo checkpoint recomendado: extrair a integração Evolution global da plataforma para um runtime próprio — migração dos segredos em repouso, configuração gerenciada, envio de OTP e nome da instância — preservando fallback inicial por ambiente, AES-256-GCM, validação DNS, bloqueio de redirects e compatibilidade com o console DEV.

## Checkpoint 55 implementado

Partindo das 835 linhas físicas deixadas pelo checkpoint 54, a integração Evolution global da plataforma foi extraída para `server/platformEvolutionRuntime.ts`. O runtime concentra os contextos criptográficos da plataforma e de cada tenant, leitura segura de segredos legados ou cifrados, migração transacional em repouso, configuração gerenciada com fallback inicial por ambiente, nome da instância global, normalização e máscara do telefone de MFA e envio das mensagens de OTP.

Foram preservados AES-256-GCM pelo primitivo canônico, separação obrigatória de propósito entre chave global e chave do tenant, falha imediata no startup quando um ciphertext não pode ser aberto no contexto esperado, proibição de substituir silenciosamente um segredo válido, marcação `encrypted`, timestamp da migração, prioridade da configuração persistida, fallback por `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE_NAME`, número brasileiro normalizado, resposta booleana sem vazamento do provedor, resolução HTTPS com proteção DNS/SSRF, timeout de dez segundos e bloqueio de redirects. O router DEV deixou de receber o propósito criptográfico bruto e passou a receber somente a operação segura de cifrar a chave global; o runtime por tenant também recebe operações contextuais, sem conhecer strings de propósito.

O `server/index.ts` caiu de 835 para 773 linhas físicas, redução de 62 linhas, com novo teto arquitetural de 810; o runtime possui 137 linhas físicas. O auditor registra 774 linhas no index e 138 no runtime por contabilizar o segmento após a última quebra de linha. Cinco testes adicionais em SQLite real e rede controlada validam migração e idempotência, separação de contexto, rollback diante de ciphertext incompatível, prioridade banco/ambiente, operações de criptografia, normalização e máscara de MFA, resolução segura da URL, ausência de redirects e payload do OTP. A suíte unitária passa de 84 para 89 testes; arquitetura e segurança permanecem integralmente aprovadas.

Próximo checkpoint recomendado: extrair o serviço compartilhado de criação de agendamentos da cliente — validação do serviço, regras e fuso, antecedência, horizonte futuro, horário comercial, bloqueios, conflito transacional e agendamento das automações — para que as rotas públicas e o portal reutilizem um domínio independente do bootstrap.

## Checkpoint 56 implementado

Partindo das 773 linhas físicas deixadas pelo checkpoint 55, o serviço compartilhado de criação de agendamentos da cliente foi extraído para `server/customerAppointmentService.ts`. O módulo passou a concentrar a seleção do serviço ativo, duração, regras de antecedência e horizonte, fuso horário, expediente, alinhamento do slot, folgas, conflito transacional e criação do horário; as rotas de booking público e do portal autenticado continuam recebendo a mesma função única por injeção.

Foram preservados o isolamento por tenant, os defaults de sessenta minutos de antecedência, sessenta dias de horizonte e passos de quinze minutos, o fallback de fuso para `America/Sao_Paulo`, a rejeição de horários que atravessam o dia, o bloqueio de folgas, a sobreposição somente com estados `CONFIRMED` ou `PENDING`, a transação imediata, os estados iniciais `PENDING` e `NOT_REQUESTED` e o agendamento das automações somente após o commit. Relógio e gerador de identificadores são injetáveis apenas como infraestrutura de teste, sem alterar o contrato das rotas.

O `server/index.ts` caiu de 773 para 731 linhas físicas, redução de 42 linhas, com novo teto arquitetural de 750; o serviço possui 120 linhas físicas. O auditor registra 732 linhas no index e 121 no serviço por contabilizar o segmento após a última quebra de linha. Seis testes adicionais em SQLite real e relógio controlado validam persistência e duração, estados iniciais, automações após o commit, serviço ativo e escopo por tenant, duração inválida, data, antecedência, horizonte, fuso, expediente, alinhamento, virada de dia, folgas, cancelamentos, conflitos ativos, defaults e isolamento multi-tenant. A suíte unitária passa de 89 para 95 testes; o contrato do ciclo de agendamentos e a arquitetura permanecem integralmente aprovados.

Próximo checkpoint recomendado: extrair a emissão e validação do OTP do portal da cliente para um serviço de autenticação próprio, preservando resposta antienumeração, hash contextual, expiração, limite de tentativas, consumo único, envio por WhatsApp e criação da sessão persistente.

## Checkpoint 57 implementado

Partindo do checkpoint 56, a emissão e a validação do OTP da cliente foram extraídas do router para `server/clientAccessService.ts`. O serviço agora concentra resolução do tenant ativo, normalização do telefone, disponibilidade do WhatsApp, busca isolada da cliente, invalidação dos códigos anteriores, geração e hash do novo código, envio operacional, expiração, limite de tentativas, comparação em tempo constante, consumo único e devolução da identidade autenticada. O router mantém somente schemas Zod, ordem dos três limitadores, adaptação HTTP e criação da sessão persistente pelo callback executado pelo serviço após a validação.

Foram preservados a resposta `{ sent: true }` tanto para telefone conhecido quanto desconhecido, bloqueando enumeração; OTP criptograficamente aleatório de seis dígitos; validade de cinco minutos; máximo de cinco tentativas; hash separado por tenant e usuário; mensagem sem persistência na inbox; falha de entrega sem vazamento de telefone ou código; código consumido antes da criação da sessão; e isolamento multi-tenant. A invalidação do código anterior e a criação do novo passaram a compartilhar uma transação, reforçando a atomicidade sem mudar o contrato público.

O `server/routes/clientPortalRoutes.ts` caiu de 223 para 166 linhas físicas. O serviço possui 164 linhas físicas; o `server/index.ts` passou de 731 para 735 linhas apenas pela composição explícita das dependências, permanecendo abaixo do teto arquitetural de 750 e sem receber regra de negócio. Cinco testes diretos adicionais em SQLite real, relógio, IDs e OTP controlados validam emissão, expiração, invalidação, antienumeração, tenant ativo, configuração do WhatsApp, tentativas, hash, consumo único, callback da sessão, códigos expirados e bloqueados, isolamento e falha de entrega segura. A suíte unitária passa de 95 para 100 testes; o teste HTTP completo do portal continua cobrindo limitadores, payloads e sessão.

Próximo checkpoint recomendado em lote coeso: extrair o estado e a trilha de consentimento WhatsApp da cliente para um serviço próprio, unificando booking público, portal e integrações de mensagem sem mover contratos de rota.

## Checkpoint 58 implementado

Partindo do checkpoint 57, a mutação do consentimento promocional da cliente foi extraída do núcleo Evolution para `server/clientMarketingConsentService.ts`. O serviço é agora a fonte única para conceder ou retirar a autorização usada pelo booking público, portal autenticado e palavra-chave recebida pelo webhook; campanhas e envios continuam consultando o mesmo estado canônico imediatamente antes do disparo.

Foram preservados a versão `whatsapp-promos-v1`, o texto exato aceito, canal `WHATSAPP`, fontes distintas por origem, ações `GRANTED` e `WITHDRAWN`, data histórica do primeiro opt-in, data do opt-out, limpeza do opt-out em nova concessão, idempotência sem eventos duplicados e isolamento conjunto por tenant e usuário. Atualização do estado e inserção da evidência permanecem numa transação imediata; um teste explícito confirma rollback integral quando a evidência não pode ser gravada.

O `server/whatsappEvolutionRuntime.ts` caiu de 473 para 444 linhas físicas; o novo serviço possui 82 linhas. O `server/index.ts` passou de 735 para 737 linhas somente pela composição explícita, permanecendo abaixo do teto de 750; o auditor contabiliza 738. Quatro testes diretos adicionais em SQLite real validam concessão, retirada, versão, texto, origem, timestamps, idempotência, isolamento, cliente inexistente e rollback atômico. A suíte unitária passa de 100 para 104 testes, mantendo também os testes de integração do booking, portal, webhook e envio promocional.

Próximo checkpoint recomendado: extrair o consentimento promocional da plataforma e sua trilha legal para um serviço próprio, retirando do bootstrap as regras de opt-in/opt-out da conta profissional sem misturá-las ao consentimento das clientes.

## Checkpoint 59 implementado

Partindo do checkpoint 58, o consentimento promocional da conta profissional e o registro de aceitação legal foram extraídos do bootstrap para `server/professionalConsentService.ts`. O serviço passou a concentrar concessão, retirada ou recusa das comunicações da plataforma, atualização do estado atual, evento auditável e persistência append-only do aceite dos documentos; as rotas de autenticação e o checkout público continuam recebendo as mesmas duas funções por injeção.

Foram preservados o texto e a versão canônicos da autorização WhatsApp, canal, origem, ações `GRANTED`, `WITHDRAWN` e `DECLINED`, histórico do primeiro opt-in, data de opt-out, reativação, resposta `changed`, erro para usuário inexistente, versões de Termos e Privacidade, hash do bundle, snapshot integral, fingerprints HMAC de IP e user-agent e timestamp único controlável. Estado promocional e evento agora são gravados numa transação imediata, com rollback explícito se a evidência falhar; essa transação permanece compatível com o checkout transacional já existente.

O `server/index.ts` caiu de 737 para 707 linhas físicas, redução de 30 linhas e permanência sob o teto arquitetural de 750; o novo serviço possui 108 linhas. O auditor contabiliza 708 linhas no index e 109 no serviço por considerar o segmento após a última quebra de linha. Quatro testes diretos adicionais em SQLite real, relógio, IDs e fingerprints controlados validam concessão, retirada, recusa, política, texto, origem, timestamps, versões legais, bundle, snapshot, evidência, usuário inexistente e rollback atômico. A suíte unitária passa de 104 para 108 testes; arquitetura, legal/compliance, consentimento e integrações de onboarding e configurações continuam cobertos pelo gate integral.

Próximo checkpoint recomendado em lote coeso: extrair o ciclo de vida do processo HTTP e a limpeza periódica de estado transitório de segurança para um runtime próprio, preservando bind, startup, timers, `unref`, sinais e ordem de shutdown.

## Checkpoint 60 implementado

Partindo do checkpoint 59 e adotando um lote maior por subsistema, todo o ciclo operacional do processo foi separado em dois módulos complementares. `server/securityStateMaintenance.ts` concentra a limpeza das tabelas transitórias e seus agendamentos; `server/serverLifecycleRuntime.ts` concentra bind HTTP, inicialização dos workers, registro de sinais e encerramento ordenado. O `server/index.ts` agora apenas injeta o banco, o listener e os runtimes gerenciados.

Foram preservados bind em loopback na produção e em todas as interfaces no desenvolvimento, início dos runtimes de domínio, automações e WhatsApp após a criação do servidor, limpeza de rate limits após 30 dias, desafios consumidos ou expirados após um dia, sessões e dispositivos expirados ou revogados após 90 dias, intervalo de seis horas, execução inicial após 25 segundos e `unref` de todos os timers. O shutdown continua idempotente, atende `SIGTERM` e `SIGINT`, interrompe os workers na ordem, cancela a manutenção, fecha conexões ociosas, encerra banco e processo após o fechamento gracioso e força o encerramento das conexões após dez segundos. O timeout forçado agora é cancelado quando o fechamento gracioso termina, evitando trabalho residual em ambientes de teste ou hosts que não encerram imediatamente o processo.

O `server/index.ts` caiu de 707 para 668 linhas físicas, redução de 39 linhas, e o teto arquitetural foi reduzido de 750 para 700. A manutenção possui 53 linhas e o lifecycle 74; o auditor contabiliza respectivamente 669, 54 e 75 por considerar o segmento após a última quebra de linha. Cinco testes determinísticos adicionais, com SQLite real e servidor, sinais e timers controlados, validam todas as janelas de retenção, preservação de registros ativos, intervalos, `unref`, start idempotente, cancelamento integral, ordem de startup e shutdown, fechamento gracioso, repetição segura e timeout forçado sem fechamento duplicado do banco. A suíte unitária passa de 108 para 113 testes.

Próximo checkpoint recomendado, ainda em lote maior: extrair do bootstrap a configuração comercial e de entrada — catálogo de planos, cotações, helpers de indicação, host/origens e registro dos limitadores — mantendo o `index.ts` focado exclusivamente na composição dos módulos.

## Checkpoint 61 implementado

Partindo do checkpoint 60, a configuração comercial e os controles de entrada foram retirados do bootstrap em um lote único de três módulos. `server/commercialConfig.ts` concentra catálogo oficial, promoção da primeira mensalidade, cotação com desconto, histórico de compra paga, token e URL de indicação. `server/platformNetworkConfig.ts` concentra hostname público, alvo CNAME e listas IPv4/IPv6 de verificação. `server/requestLimiters.ts` registra numa única factory os 21 limitadores globais e específicos usados pelas rotas.

Foram preservados os quatro preços oficiais, equivalência e economia dos ciclos, promoção mensal de R$ 39,90 apenas na primeira compra quando mais vantajosa, desconto calculado exclusivamente no servidor, detecção de compra paga apenas nos ciclos de assinatura, token criptográfico de 24 bytes, URL de indicação sem caminho ou fragmento herdado e fallback relativo. A rede mantém prioridade de `APP_BASE_URL`, fallback para `FRONTEND_ORIGIN`, hostname normalizado, tolerância ao valor inválido já reportado pelo preflight e listas DNS sem entradas vazias. Todos os limites, janelas, persistência e chaves continuam idênticos; OTP usa hash SHA-256 do cookie de pré-autenticação, e-mail é normalizado, telefones usam a normalização brasileira e operações administrativas permanecem isoladas por usuário.

O `server/index.ts` caiu de 668 para 582 linhas físicas, redução de 86 linhas num único checkpoint; o teto arquitetural caiu de 700 para 620. Os novos módulos possuem 74, 45 e 66 linhas físicas; o auditor contabiliza 583 linhas no index por considerar o segmento após a última quebra de linha. Sete testes adicionais com SQLite real e factories controladas validam catálogo, promoção, descontos, isolamento de compra, token, URLs, hostname, DNS, os 21 limitadores e todas as chaves sensíveis. A suíte unitária passa de 113 para 120 testes.

Próximo checkpoint recomendado em lote maior: extrair a fundação final do processo — versão do aplicativo, handlers fatais e entrega estática/SEO de produção — e iniciar a separação da montagem do Express da execução do processo, preservando a ordem exata de middlewares e rotas.

## Checkpoint 62 implementado

Partindo do checkpoint 61, a fundação final do processo foi retirada do bootstrap em um lote coeso de quatro módulos. `server/processFoundation.ts` concentra leitura segura da versão, logs iniciais e handlers de `uncaughtException` e `unhandledRejection`; `server/productionClientDelivery.ts` concentra a entrega estática e o fallback HTML com SEO por host; `server/domainSetupPayload.ts` concentra a representação pública das instruções TXT, CNAME e A/AAAA; `server/applicationServerRuntime.ts` conecta host, listener, manutenção de segurança e lifecycle sem deixar detalhes de execução espalhados no `index.ts`.

Foram preservados fallback de versão para `unknown`, encerramento fatal com código 1, bind em `127.0.0.1` na produção e `0.0.0.0` nos demais ambientes, ordem dos runtimes gerenciados, manutenção transitória, shutdown gracioso, entrega de assets sem `index` automático, fallback fora de `/api`, `Cache-Control: no-cache`, `Vary: Host`, indexação apenas da raiz do domínio principal e `noindex` para painéis, login, tenants e demais caminhos. As instruções de domínio mantêm nomes e valores TXT, prioridade do CNAME e fallback A/AAAA sem alterar o contrato das rotas administrativas.

O `server/index.ts` caiu de 582 para 520 linhas físicas, redução de 62 linhas num único checkpoint; o teto arquitetural caiu de 620 para 550. Os quatro novos módulos possuem 55, 42, 39 e 34 linhas físicas; o auditor contabiliza 521 linhas no index por considerar o segmento após a última quebra de linha. Seis testes adicionais validam versão e fallback, registro dos dois eventos fatais, logs e saída, ausência de leitura estática fora de produção, entrega HTTP real com headers e SEO por host, instruções CNAME, fallback A/AAAA, token ausente e conversão da flag de domínio primário. A suíte unitária passa de 120 para 126 testes.

Próximo checkpoint recomendado em lote maior: separar a montagem do Express em registradores coesos por superfície — plataforma/público, administração e WhatsApp/cliente — mantendo o `server/index.ts` como raiz de composição e evitando apenas transferir o monólito inteiro para outro arquivo.

## Checkpoint 63 implementado — separação estrutural concluída

Partindo do checkpoint 62, o registro das rotas foi distribuído em três módulos com responsabilidades distintas: `server/routes/registerPlatformRoutes.ts` monta endpoints operacionais, públicos, autenticação, console DEV e checkout inicial; `server/routes/registerBillingAssistantRoutes.ts` monta billing, webhooks, assinatura, indicações, onboarding, Luma e serviços; `server/routes/registerTenantRoutes.ts` monta agenda, configuração do tenant, financeiro, WhatsApp, agendamento público e portal da cliente. Os routers de domínio e os serviços já separados nas etapas anteriores permanecem como fonte das regras. `server/index.ts` cria os serviços, conecta as dependências e registra os três blocos na ordem original.

O guard de assinatura permanece entre os endpoints de faturamento acessíveis antes da assinatura e os demais endpoints administrativos. Os limitadores globais continuam antes dos registradores; os webhooks continuam em suas posições; o runtime de agendamentos é criado depois do segundo registrador, e o worker do WhatsApp é criado após o registro do agendamento público. O fallback `/api/*`, a entrega estática e o handler final de erros permanecem no fim. Os testes de rotas existentes continuam cobrindo contratos HTTP e isolamento por tenant; a auditoria arquitetural agora verifica a ordem real dos registros nos três módulos.

O `server/index.ts` caiu de 520 para 170 linhas físicas, redução de 350 linhas neste lote e novo teto arquitetural de 210. A suíte unitária permanece com 126/126 testes aprovados, o `npm run check` completo aprovou tipagem, lint, auditorias e build. Um teste prático com `dist/server/index.js`, SQLite temporário e listener local verificou `/api/health`, `/api/ready`, catálogo público, documentos legais, sessão sem usuário, 404 de API e encerramento gracioso. Não houve acesso a ambiente de produção neste checkpoint.

**Estado:** a modularização estrutural do frontend e do backend está concluída. Não é necessário criar outro checkpoint de extração por contagem de linhas. O trabalho seguinte é a homologação independente descrita nas seções Fable 5.1 e Opus 5 abaixo, incluindo staging local, fluxos ponta a ponta, preflight no ambiente real e smoke tests seguros após o deploy autorizado. Essas validações ainda não foram executadas neste ambiente.

## GPT Sol — implementação estrutural

O GPT Sol deve continuar por lotes coesos de subsistema, maiores quando houver cobertura determinística suficiente, e sempre preservar comportamento.

### Frontend

1. Extrair tipos de domínio de `App.tsx`.
2. Separar `Shell`, notificações e navegação em `src/layouts`.
3. Separar páginas em `src/features`: dashboard, agenda, clientes, serviços, financeiro, configurações, autenticação, booking, portal da cliente e console DEV.
4. Manter handlers e payloads iguais na primeira movimentação.
5. Criar `AppRoutes.tsx` e reduzir `App.tsx` à composição de providers e rotas.
6. Adicionar `React.lazy` por área somente depois de cada página isolada passar pelos testes.
7. Consolidar CSS apenas após a separação estrutural, medindo o bundle antes e depois.

### Backend

1. Separar montagem do Express da inicialização do processo.
2. Extrair routers por domínio: public, auth, dev, billing, assistant, appointments, clients, services, finance, domains, WhatsApp e client portal.
3. Preservar exatamente path, método, ordem dos middlewares, status, código de erro e payload.
4. Extrair regras para services somente depois dos routers estarem estáveis.
5. Extrair SQL para repositories por domínio sem introduzir ORM.
6. Separar workers de automação, campanhas, mídia e verificação de domínios.
7. Manter shutdown, leases, transações e idempotência atuais.

### Gate obrigatório por checkpoint

```bash
npm run typecheck
npm run lint
npm run test
npm run test:architecture
npm run build
```

Ao concluir uma área maior, executar `npm run check` integralmente.

## Fable 5.1 — auditoria prática e integridade

O Fable 5.1 deve atuar no Claude Code como auditor independente da implementação:

1. revisar o diff e procurar código perdido, duplicado ou apenas ocultado por fachadas;
2. comparar inventário das 132 rotas antes e depois;
3. confirmar métodos, paths, middlewares, papéis, códigos HTTP e schemas;
4. criar testes de caracterização onde a cobertura existente apenas procura strings;
5. subir frontend, API, workers e banco descartável localmente;
6. executar fluxos reais pelo navegador e pela API;
7. testar isolamento multi-tenant, autorização, concorrência de horários, idempotência, migrations, backup e restauração;
8. registrar comandos, evidências e defeitos encontrados;
9. corrigir problemas objetivos e repetir a matriz até ficar limpa.

## Opus 5 — homologação final e decisão de deploy

O Opus 5 deve fazer a revisão final no Claude Code após a aprovação do Fable 5.1:

1. revisar arquitetura, segurança, transações e integrações críticas;
2. executar instalação limpa e `npm run check`;
3. validar banco novo e upgrade de uma cópia anonimizada do banco anterior;
4. homologar em staging com HTTPS, Caddy, subdomínios, domínio personalizado, Evolution, OpenRouter e pagamento controlado;
5. repetir os fluxos de login, MFA, tenant, agenda, booking, cliente, financeiro, billing, indicações, Luma, WhatsApp, campanhas e consentimento;
6. testar falhas, reinício, filas, webhooks, backup e restauração em ambiente isolado;
7. bloquear o deploy se existir falha crítica ou alta;
8. verificar rollback antes de promover o artefato;
9. após o deploy, executar somente smoke tests seguros em produção;
10. publicar relatório final com evidências, riscos residuais e decisão de aprovação.

## Limites em produção

Não executar em produção campanhas em massa, restauração sobre banco ativo, exclusões permanentes, corrupção simulada, carga destrutiva ou testes que atinjam clientes reais. Esses cenários pertencem ao ambiente local ou staging. Produção recebe apenas smoke tests com contas e dados identificados de homologação.

## Critérios de conclusão

- `App.tsx` e `server/index.ts` tornam-se apenas pontos de composição;
- nenhuma rota, tela ou regra desaparece;
- isolamento entre tenants comprovado;
- migrations aprovadas em banco novo e atualizado;
- testes comportamentais e end-to-end aprovados;
- staging homologado;
- rollback validado;
- smoke tests de produção aprovados;
- relatório do Fable 5.1 revisado e decisão final registrada pelo Opus 5.

Fable 5.1 e Opus 5 possuem escopo técnico suficiente para executar essa homologação dentro do Claude Code, desde que tenham acesso aos comandos do projeto, navegador automatizado, ambientes, logs e credenciais específicas de teste.


## Homologação adicional da 5.12.7 — Fable 5.1 e Opus 5

Fable 5.1 deverá rodar localmente/staging o fluxo cadastro → falha Appmax → acesso ADMIN com OTP real → retomada do pagamento → liberação; estorno → bloqueio operacional → novo pagamento → acesso restaurado. Verificar que STAFF/CLIENT não entram em recuperação, que outra loja não recebe sessão ou dados e que suspensão manual continua bloqueada mesmo com confirmação de pagamento. Revisar e executar `npm run test:recovery-ui`, incluindo data vazia e respostas fora de ordem da agenda, em desktop e mobile.

Opus 5 deverá revisar de forma independente a migração 43, testar upgrade com backup/restore, confirmar os limites financeiros e a causa das suspensões, revisar os resultados e executar o fluxo completo após deploy autorizado. Testes em produção dependem de acesso, credenciais e contas de teste com operações controladas; não processar estornos em clientes reais. A execução desses passos é uma tarefa de validação, não uma garantia antecipada de integridade total.
