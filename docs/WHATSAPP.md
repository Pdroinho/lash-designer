# WhatsApp / Evolution API — operação 5.1

## Escopo atual

A 5.1 mantém a Central de Relacionamento endurecida na 5.0 e adiciona uma instância global de plataforma para MFA profissional. O backend suporta:

- inbox persistida de mensagens recebidas e enviadas;
- envio manual pelo ADMIN;
- confirmação e lembrete de agendamentos por jobs persistentes;
- `MESSAGES_UPSERT`, `MESSAGES_UPDATE` e `CONNECTION_UPDATE`;
- status de envio/entrega/leitura monotônico;
- health check e tentativa controlada de reconexão;
- mídia recebida em storage privado fora do SQLite;
- consentimento promocional e opt-out explícito;
- diagnóstico da instância e do webhook.

Broadcast promocional em massa continua bloqueado. A existência de consentimento não transforma disparo em massa em recurso liberado automaticamente.

## Credenciais e responsabilidade

Em produção, URL e API key da Evolution são gerenciadas pela plataforma/DEV. A instância global `lashdesigner-global` envia OTP de login ADMIN/DEV. Cada espaço mantém uma instância própria para inbox/agendamentos, preservando roteamento e isolamento multi-tenant.

As API keys persistidas no SQLite são criptografadas com material derivado de `APP_ENCRYPTION_KEY`. A API nunca devolve o segredo em plaintext.

Configurações legadas por tenant podem existir em bancos atualizados, mas não controlam o endpoint efetivo em produção. `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE_NAME` são fallback de bootstrap para o primeiro login DEV; a configuração persistida no painel tem prioridade.

## Política de URL externa / SSRF

Antes de chamar a Evolution, o backend exige:

- HTTPS;
- ausência de usuário/senha, query string e fragmento;
- hostname não local;
- IP literal público quando aplicável;
- resolução DNS somente para endereços públicos;
- `redirect: 'error'` nas chamadas ao provider.

A validação DNS reduz a superfície de SSRF, mas não é tratada como pinning criptográfico de DNS. A principal barreira em produção é que tenants comuns não escolhem o host da integração.

## Webhook

O webhook é tenant-scoped, valida a instância esperada e exige um segredo compartilhado enviado pela Evolution em header customizado (`x-webhook-secret`). A Evolution API atual suporta headers customizados na configuração do webhook; esse header é configurado pelo backend no mesmo `webhook/set` que registra os eventos. Eventos relevantes:

- `MESSAGES_UPSERT`: entrada/saída e persistência da inbox;
- `MESSAGES_UPDATE`: receipts de entrega/leitura;
- `CONNECTION_UPDATE`: saúde de conexão.

O log operacional do webhook guarda somente hash e metadados de diagnóstico. Payload integral não é persistido como log.

Mensagens de grupo continuam fora do escopo da inbox.

## Receipts

A progressão é monotônica:

`UNKNOWN -> SENT -> DELIVERED -> READ`

Eventos atrasados não podem fazer uma mensagem `READ` voltar para `DELIVERED`. Falha pode ser substituída por estado posterior comprovado pelo provider.

## Health e reconexão

O worker de saúde:

- consulta um conjunto limitado de instâncias por ciclo;
- registra último check, último sucesso e último erro;
- usa cooldown exponencial para falhas;
- usa claim persistente para evitar reconexões concorrentes dentro da arquitetura single-instance;
- não reconecta em loop apertado;
- mantém diagnóstico visível para a Central.

## Confirmação de agendamento

A mensagem normal usa resposta simples:

- `1` para confirmar;
- `2` para informar que não poderá comparecer.

Novas mensagens não expõem identificador aleatório. `confirmation_code` é mantido apenas como compatibilidade de correlação para mensagens legadas já emitidas.

Prioridade de correlação:

1. resposta citando a mensagem específica enviada pelo sistema;
2. código legado, se realmente presente na resposta;
3. candidato único do telefone dentro da janela segura;
4. se houver mais de um candidato, não escolher silenciosamente: pedir desambiguação humana.

O parser considera a frase completa e dá precedência a negativas. Ex.: `não vou conseguir confirmar agora` é recusa, não confirmação.

## Consentimento e opt-out

Não existe segunda fonte de verdade de opt-out. O comando explícito de saída atualiza a preferência promocional já existente no cadastro da cliente.

Opt-out de marketing não bloqueia:

- OTP de autenticação;
- comunicação operacional de agendamento;
- mensagens de sistema necessárias.

## Mídia

Mídia recebida não é armazenada como base64 no SQLite.

Contrato:

- limite de 8 MB;
- MIME normalizado;
- path local gerado pelo servidor;
- diretório privado configurado por `WHATSAPP_MEDIA_DIR`;
- arquivo com permissões restritas;
- metadata e path relativo no banco;
- retry limitado quando o download falha;
- endpoint autenticado e tenant-scoped: `GET /api/admin/whatsapp/messages/:id/media`;
- nenhum diretório de mídia exposto por `express.static`.

Falha no download da mídia não descarta a mensagem da inbox.

## Scheduler

A criação/edição/cancelamento de agendamento continua sendo o caminho principal para criar/recalcular jobs. O scan periódico é apenas reconciliador de segurança e busca um conjunto limitado de appointments sem jobs executáveis esperados.

## Polling da Central

A interface usa polling adaptativo:

- frequência normal durante uso ativo;
- backoff após inatividade;
- frequência mínima quando a aba está escondida;
- atualização imediata em `focus`/`visibilitychange`;
- sem `scrollIntoView()` global;
- auto-scroll de chat somente quando o usuário está próximo do fim.

## Homologação obrigatória

1. Configurar/conectar a Evolution API Global e validar um OTP profissional real.
2. Criar/conectar a instância do tenant.
3. Confirmar webhook com os três eventos.
4. Enviar mensagem manual autorizada.
5. Receber resposta real e validar persistência inbound.
6. Validar `SENT -> DELIVERED -> READ` em aparelho real.
7. Desconectar/reconectar aparelho e observar cooldown/health.
8. Receber imagem, áudio e documento dentro do limite.
9. Confirmar que a mídia só abre autenticada no tenant correto.
10. Testar opt-out promocional sem bloquear OTP/agendamento.
11. Testar dois agendamentos ambíguos para o mesmo telefone e confirmar que nenhum é escolhido automaticamente.
12. Revisar logs para garantir ausência de API key, payload bruto e dados sensíveis desnecessários.

## Campanhas promocionais — 5.6

Campanhas não usam mais broadcast direto. O fluxo aprovado é `POST /api/admin/whatsapp/campaigns`, com audiência somente de clientes que possuem `marketing_whatsapp_opt_in = 1`, fila persistida por destinatário, limite de audiência e revalidação do consentimento imediatamente antes do envio.

A feature começa desligada em produção (`WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED=false`). O endpoint legado `/api/admin/whatsapp/broadcast` permanece bloqueado para impedir contorno da fila.

Toda campanha inclui instrução de opt-out. Respostas `SAIR`, `PARE`, `PARAR` e `STOP` processadas pelo webhook retiram a autorização promocional. O worker usa `purpose: 'MARKETING'`, que realiza uma segunda checagem do consentimento antes de chamar o provedor.

Ver `docs/LEGAL_COMPLIANCE_5.6.md` para homologação e limites operacionais.
