# Lash Designer 3.7.1 — Appointment Lifecycle

## Objetivo

Automatizar o ciclo de confirmação de presença sem transformar a agenda da profissional em uma fila manual de mudanças de status.

O princípio desta versão é simples: **o fluxo normal acontece sozinho; a dona entra apenas nas exceções.**

## Modelo de estados

A versão separa duas informações que antes podiam ser confundidas:

### Estado do horário (legado/agenda)
- `PENDING`
- `CONFIRMED`
- `CANCELLED`

Esse campo continua existindo por compatibilidade e para representar o registro do horário. A migração **não converte registros PENDING em massa**.

### Confirmação de presença da cliente
- `NOT_REQUESTED`
- `AWAITING_CONFIRMATION`
- `CONFIRMED`
- `DECLINED`
- `NO_RESPONSE`
- `DELIVERY_FAILED`
- `MANUALLY_CONFIRMED`

Esse é o estado usado pela nova experiência operacional da dona.

## Automação padrão

- Solicitar confirmação: 24h antes.
- Reenvio: 8h após a primeira solicitação, desde que ainda exista janela segura.
- Sem resposta: 4h antes do atendimento.
- Lembrete final: 2h antes, somente para presença já confirmada.
- Cancelamento automático após recusa: desligado por padrão.

Os horários são configuráveis na área de WhatsApp.

## Fila persistente

A automação não depende de `setTimeout` por agendamento. Os jobs ficam no banco em `appointment_automation_jobs` e um worker leve processa a fila periodicamente.

A fila possui:
- chave de idempotência por agendamento + tipo de job;
- status persistente;
- contador de tentativas;
- lease (`claimed_at`) para recuperação de processos interrompidos;
- retry limitado;
- proteção para que reconciliação não reative jobs falhos continuamente;
- cancelamento de jobs quando o agendamento é cancelado ou a presença é resolvida.

## WhatsApp / Evolution

Antes do primeiro envio automático, o backend garante a configuração do webhook `MESSAGES_UPSERT`.

O webhook é configurado com URL tenant-scoped e segredo de webhook. O backend também valida que o `instanceName` recebido pertence ao mesmo tenant da URL antes de tocar em qualquer agendamento.

A mensagem de confirmação inclui um código curto. Exemplos de resposta:

- `1 A7F2` → confirma presença.
- `2 A7F2` → informa que não poderá comparecer.

Resposta sem código só é aplicada automaticamente quando existe exatamente um agendamento elegível para aquele telefone. Havendo ambiguidade, nenhuma alteração é feita e a cliente recebe instrução para responder com o código.

## Experiência da dona

### Dashboard

Mostra:
- confirmados;
- aguardando resposta;
- exceções que precisam de atenção.

Clientes em `NO_RESPONSE`, `DELIVERY_FAILED` ou `DECLINED` aparecem em um bloco operacional com ações de reenviar ou confirmar manualmente.

### Agenda

O horário continua reservado independentemente da confirmação de presença. A cor e o badge passam a comunicar a confirmação da cliente, e existe uma legenda explícita.

Ao abrir um atendimento, a dona vê:
- serviço e horário;
- situação do registro;
- estado de confirmação;
- quando a confirmação foi solicitada;
- quando houve resposta;
- enviar/reenvia WhatsApp;
- confirmar manualmente;
- cancelar o agendamento.

### Configuração de WhatsApp

Foi adicionada uma área própria para a automação de confirmação, com:
- antecedência do primeiro envio;
- janela do reenvio;
- cutoff de falta de resposta;
- template da mensagem;
- código de correlação obrigatório;
- opção separada de cancelamento automático;
- teste de mensagem.

O lembrete final virou uma automação distinta e só é enviado a quem confirmou presença.

## Cliente

A tela final do booking agora diz “Agendamento realizado” e explica que a confirmação será solicitada pelo WhatsApp mais perto do atendimento. O portal da cliente também utiliza o estado de confirmação de presença para os rótulos exibidos.

## Luma

A Luma diferencia explicitamente:
- status do horário;
- confirmação de presença.

Ela pode localizar atendimentos por `confirmation_status` e preparar confirmação manual de presença quando a dona informa que confirmou por outro canal, sem alterar silenciosamente o status bruto do horário.

## Compatibilidade com Financeiro

As regras financeiras preservam compatibilidade com registros legados `CONFIRMED`, mas também reconhecem confirmações de presença novas (`CONFIRMED` e `MANUALLY_CONFIRMED`) sem depender de uma migração destrutiva de status.
