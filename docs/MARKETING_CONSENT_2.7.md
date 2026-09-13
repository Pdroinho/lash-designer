# Consentimento de marketing — 2.7

## Princípio de produto

Confirmações de agendamento e comunicações promocionais são tratadas como finalidades distintas. O telefone continua obrigatório para identificar o booking e viabilizar confirmações; promoções dependem de uma escolha opcional separada.

## Contrato do booking

O frontend envia `marketingConsent: boolean` no mesmo POST do agendamento público. A ausência do campo é interpretada como `false` pelo backend.

A autorização só é gravada quando o valor recebido é `true`. Um submit posterior com `false` não sobrescreve um opt-in anterior, evitando que a simples ausência de nova marcação seja interpretada como cancelamento.

## Alteração posterior

A cliente autenticada por OTP possui:

- `GET /api/client/marketing-preferences`;
- `PUT /api/client/marketing-preferences` com `{ "whatsappPromotions": boolean }`.

O `PUT` é o caminho explícito para opt-in/opt-out posterior e gera novo evento de auditoria quando há mudança real de estado.

## Dados persistidos

`clients` mantém o estado atual para consulta rápida. `client_marketing_consent_events` mantém o histórico de mudanças para auditoria.

Nenhuma campanha automática é habilitada por esta migração. O endpoint de broadcast segue bloqueado até a camada de execução possuir fila, limites e seleção por consentimento ativo.

## Evolução 5.6 — campanhas

A autorização registrada passou a alimentar uma fila promocional real. A audiência é capturada somente com opt-in ativo e cada destinatário é revalidado no momento do envio. Retirada posterior à criação da campanha resulta em `SKIPPED`.

A plataforma mantém o opt-in desmarcado por padrão e não mistura consentimento de marketing com Termos de Uso, Privacidade, agendamento ou mensagens transacionais.
