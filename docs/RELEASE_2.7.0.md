# Release 2.7.0 — Marketing Consent & Messaging Readiness

A 2.7.0 fecha a pendência de autorização para comunicações promocionais sem transformar a última etapa do agendamento em um formulário jurídico. A experiência continua rápida: o consentimento é opcional, começa desmarcado, usa uma única linha de copy e guarda a explicação complementar atrás de um `Ler mais` discreto.

## Opt-in no booking

Na etapa final, abaixo da microcopy de uso do WhatsApp e antes do CTA, entrou o controle:

> Quero receber novidades e ofertas no WhatsApp.

Regras da experiência:

- começa **desmarcado**;
- não interfere na criação do agendamento;
- `Ler mais` expande uma explicação curta sem abrir modal;
- a escolha é enviada apenas no submit final;
- um booking futuro com a caixa desmarcada **não revoga** uma autorização concedida anteriormente;
- a cliente pode alterar a preferência depois na área `Meus horários`.

## Persistência e auditoria

A migração 24 adiciona ao cadastro da cliente o estado atual do consentimento de WhatsApp e cria uma trilha separada de eventos.

O estado atual armazena:

- opt-in ativo/inativo;
- data do último opt-in;
- data do último opt-out;
- versão do consentimento;
- origem da alteração.

A trilha `client_marketing_consent_events` registra concessões e retiradas com:

- canal (`WHATSAPP`);
- ação (`GRANTED` / `WITHDRAWN`);
- versão da política;
- texto apresentado no consentimento;
- origem (`PUBLIC_BOOKING` ou `CLIENT_PORTAL`);
- timestamp.

O texto e a versão são mantidos para que futuras evoluções da copy não apaguem o contexto do consentimento anterior.

## Área da cliente

A área passwordless agora consulta `/api/client/marketing-preferences` e exibe, fora do fluxo de agendamento, um controle compacto de comunicação. A cliente pode ativar ou desativar `Novidades no WhatsApp` sem refazer cadastro nem cancelar horários.

## Painel da profissional

A lista de clientes passa a sinalizar `Autorizado` na coluna `Promoções` para clientes com opt-in ativo. Isso prepara a segmentação futura sem misturar mensagens transacionais com marketing.

## Broadcast continua protegido

A 2.7.0 **não libera disparo em massa automaticamente**. O endpoint de broadcast continua bloqueado até existir um worker monitorado com fila, limites e seleção exclusiva de clientes com consentimento ativo.

A infraestrutura desta release prepara a audiência e a governança; ela não cria um processo de campanha sem os controles operacionais restantes.

## Arquivos principais alterados

- `src/App.tsx`;
- `src/booking-v27.css`;
- `src/main.tsx`;
- `server/index.ts`;
- `server/migrate.ts`;
- `scripts/customer-experience-audit.mjs`;
- `scripts/marketing-consent-audit.mjs`;
- `scripts/v27-experience-qa.py`;
- `package.json`;
- `package-lock.json`.

A folha `booking-v26.css` foi substituída por `booking-v27.css`; não foi empilhada uma segunda folha de correção sobre o booking.
