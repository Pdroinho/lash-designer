# Lash Designer 3.5.0 RC — Luma Runtime 2.0 / Gemini Bridge

## Objetivo
Transformar a Luma de um chat textual em uma camada segura de inteligência e ações do Lash Designer, usando um único modelo via OpenRouter: `google/gemini-2.5-flash-lite`.

## Arquitetura entregue

### Modelo único
- Chat: `google/gemini-2.5-flash-lite`
- Visão: `google/gemini-2.5-flash-lite`
- Setup/identidade: `google/gemini-2.5-flash-lite`
- Thinking explicitamente desabilitado nas chamadas OpenRouter para reduzir custo e latência no fluxo operacional.

### Agent loop
O runtime não assume mais que toda resposta terá `message.content`.

Fluxo:
1. envia contexto mínimo + mensagem;
2. recebe texto final **ou** `tool_calls`;
3. valida os argumentos da ferramenta no servidor;
4. executa a ferramenta no tenant autenticado;
5. devolve o resultado como mensagem `tool`;
6. pede a resposta final ao modelo;
7. interrompe após o número máximo configurado de passos.

Há uma recuperação limitada para respostas sem texto e sem tool call, evitando loops de retry.

## Luma Bridge v1
A Luma não recebe SQL, acesso ao banco ou endpoint genérico. O catálogo inicial é deliberadamente pequeno:

### Leitura automática
- `get_business_snapshot`
- `list_services`
- `find_appointments`
- `find_clients`

### Escrita com confirmação humana
- `prepare_create_service`
- `prepare_confirm_appointment`

As ferramentas nunca aceitam `tenantId` ou `userId`. Esses valores são obtidos exclusivamente da sessão autenticada no servidor.

## Ações pendentes
Toda escrita é dividida em duas fases:

`prepare -> card de revisão -> confirmar -> executar`

- ações expiram em 15 minutos;
- ações são vinculadas a tenant + usuário;
- ações idênticas pendentes são deduplicadas;
- confirmação é revalidada dentro de transação;
- execução gera audit log;
- criação de serviço revalida duplicidade;
- confirmação de agendamento revalida existência, tenant e status.

## Imagem no chat
O composer agora aceita PNG/JPEG/WEBP.

No cliente:
- imagem é reduzida para até 1280 px no maior lado;
- é convertida para WEBP com compressão;
- arquivo final é limitado antes do envio.

No servidor:
- MIME é allowlist;
- data URL é validado;
- tamanho é validado novamente;
- a imagem segue para o mesmo Gemini 2.5 Flash-Lite.

Caso de uso principal já suportado:
1. cliente manda foto/flyer de um serviço;
2. Luma extrai o que conseguir;
3. pede os campos ausentes;
4. chama `prepare_create_service` quando nome, duração e preço estiverem claros;
5. a interface exibe o card de confirmação;
6. somente o backend grava após clique da administradora.

## Segurança
- nenhuma ferramenta genérica de SQL/API;
- tenant vindo somente da sessão;
- papel ADMIN obrigatório nos endpoints da Luma;
- assinatura ativa continua sendo exigida pela camada admin existente;
- schemas Zod validam argumentos e payloads;
- imagem, histórico e dados recuperados são tratados como conteúdo não confiável, nunca como instruções de sistema;
- máximo de 2 tool calls por etapa;
- máximo de passos configurável;
- writes exigem confirmação explícita;
- sem ferramenta de exclusão, autenticação, permissões, cobrança ou disparo em massa nesta versão;
- rate limit dedicado da Luma: 10 requests/min por usuário.

## Controle de custo e quota
Os limites antigos de 12 mensagens/dia deixam de ser a única defesa.

Defaults de piloto, todos configuráveis:
- `LUMA_DAILY_REQUEST_LIMIT=40`
- `LUMA_MONTHLY_REQUEST_LIMIT=500`
- `LUMA_DAILY_COST_CAP_USD=0.10`
- `LUMA_MONTHLY_COST_CAP_USD=0.75`
- `LUMA_MAX_REQUEST_COST_USD=0.01`
- `LUMA_MAX_AGENT_STEPS=3`
- `LUMA_MAX_OUTPUT_TOKENS=700`
- `LUMA_MAX_IMAGE_BYTES=1048576`

Esses números são guardrails iniciais, não limites comerciais definitivos.

Cada execução registra:
- input tokens;
- output tokens;
- reasoning tokens;
- custo reportado pelo OpenRouter;
- tool calls;
- vision inputs;
- agent steps;
- modelo;
- status.

Antes de uma chamada, o backend cria uma reserva de custo equivalente ao teto por requisição. Isso faz chamadas concorrentes entrarem no cálculo do budget e reduz risco de várias requests simultâneas ultrapassarem o cap antes da telemetria final chegar. Depois da conclusão, a reserva é substituída pelo custo real reportado.

O request_day usa o fuso do tenant.

## Banco / migration 25
A migration adiciona telemetria à `assistant_usage` e cria:
- `assistant_pending_actions`
- `assistant_action_audit`

## UI
- anexo de imagem no composer;
- preview/remover anexo;
- mensagens mostram referência do anexo sem persistir base64 no histórico local;
- cards de ação pendente;
- confirmação de serviço/agendamento pela interface;
- estado de ação concluída/erro;
- histórico pesquisável existente preservado;
- página e drawer continuam usando o mesmo componente.

## Validação executada
- 51/51 TS/TSX passaram na transpilação sintática isolada;
- Design System 3.3 aprovado (1 warning de migração: cores hex locais em `luma-v35.css`);
- responsividade: 26/26;
- UX/overlays: 18/18;
- iconografia: 16/16;
- visual system: 22/22;
- estrutural: 26/26;
- Luma Runtime 2.0: 19/19.

## Gate externo de build
`npm ci --ignore-scripts` não pôde concluir neste ambiente porque o registry interno retornou 404 para `zod-validation-error@4.0.2`. Por isso a versão continua marcada como RC até rodar o pipeline integral no ambiente de VPS/CI.

## Próximas ferramentas recomendadas
Depois de observar telemetria/custos e audit logs desta versão, expandir em lotes pequenos:
1. remarcar agendamento;
2. criar cliente;
3. editar serviço;
4. consultar disponibilidade;
5. preparar mensagem individual;
6. relatórios analíticos especializados.

Não adicionar uma ferramenta genérica de banco/API como atalho.
