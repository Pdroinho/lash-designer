# Luma Runtime 2.0 — Gemini 2.5 Flash-Lite + OpenRouter

## Modelo

A Luma usa um único modelo por padrão:

```env
OPENROUTER_MODEL=google/gemini-2.5-flash-lite
```

O mesmo modelo atende conversa, image understanding, function calling e o setup visual. O acesso continua exclusivamente pelo backend e a chave do OpenRouter nunca chega ao navegador.

## Runtime agentic

O fluxo da conversa não trata mais `content: null` como erro automático. Uma resposta sem conteúdo pode conter `tool_calls`, que são executadas pelo servidor e devolvidas ao modelo antes da resposta final.

A execução possui:

- no máximo `LUMA_MAX_AGENT_STEPS` passos por mensagem;
- no máximo duas tool calls sequenciais por passo;
- reasoning explicitamente desabilitado no OpenRouter para este modelo;
- recovery único para saída vazia sem tool call;
- turno final text-only se o limite de passos for atingido;
- custo máximo por solicitação para interromper loops caros.

## Luma Bridge

A IA não recebe SQL, token de tenant, acesso ao banco nem uma ferramenta genérica de API. Ela recebe somente ferramentas estreitas e validadas:

- `get_business_snapshot`
- `list_services`
- `find_clients`
- `find_appointments`
- `prepare_create_service`
- `prepare_confirm_appointment`

Todas as ferramentas recebem `tenantId` e `userId` exclusivamente da sessão autenticada no servidor.

### Escritas

Ferramentas `prepare_*` nunca alteram dados diretamente. Elas criam uma `assistant_pending_action` vinculada ao tenant + usuário, com expiração de 15 minutos. A interface mostra um card de confirmação e somente o endpoint autenticado `/api/admin/assistant/actions/:id/confirm` efetiva a mudança.

A confirmação é idempotente, revalida o ownership e registra `assistant_action_audit`.

Nesta versão a Luma pode:

1. localizar agendamentos;
2. preparar e confirmar um agendamento existente;
3. consultar serviços e clientes;
4. preparar e criar um serviço depois da confirmação da administradora.

Não há ferramentas para exclusão, pagamentos/assinatura, credenciais, permissões, disparos em massa ou SQL livre.

## Imagens

O composer aceita uma imagem PNG/JPEG/WEBP por mensagem. No navegador ela é reduzida para até 1280 px e convertida para WEBP antes do envio. O backend limita o payload a `LUMA_MAX_IMAGE_BYTES`.

O prompt de sistema declara imagem e dados recuperados como conteúdo não confiável. Texto encontrado dentro da imagem nunca ganha autoridade para instruir a Bridge.

Um caso suportado é:

1. administradora: “quero adicionar esse serviço” + imagem;
2. Gemini extrai nome/preço/duração que estiverem visíveis;
3. se faltar um campo, Luma pergunta somente o que falta;
4. quando os três campos estiverem claros, chama `prepare_create_service`;
5. a interface exibe o card de confirmação;
6. somente o clique da administradora cria o serviço.

## Controle de custo

`assistant_usage` passa a registrar:

- input tokens;
- output tokens;
- reasoning tokens;
- custo real retornado pelo OpenRouter;
- quantidade de tool calls;
- quantidade de imagens;
- passos do agente;
- status da execução.

Guardrails padrão:

```env
LUMA_DAILY_REQUEST_LIMIT=40
LUMA_MONTHLY_REQUEST_LIMIT=500
LUMA_DAILY_COST_CAP_USD=0.10
LUMA_MONTHLY_COST_CAP_USD=0.75
LUMA_MAX_REQUEST_COST_USD=0.01
LUMA_MAX_AGENT_STEPS=3
LUMA_MAX_OUTPUT_TOKENS=700
LUMA_MAX_IMAGE_BYTES=1048576
```

Esses valores são proteção inicial, não uma decisão comercial definitiva. O produto deve calibrar os limites usando o custo real observado por tenant durante o piloto.

## Segurança

- apenas ADMIN autenticado;
- tenant sempre derivado da sessão;
- schemas Zod em todas as ferramentas;
- sem IDs de tenant fornecidos pelo modelo;
- sem SQL livre;
- writes com human-in-the-loop;
- ações expiram em 15 minutos;
- auditoria de execução;
- limites por requisição, dia e mês;
- payload de imagem limitado;
- histórico enviado ao modelo continua limitado;
- dados recuperados e anexos tratados como não confiáveis.
