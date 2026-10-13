# 5.12.8 — Central de suporte dentro da plataforma

Base: 5.12.7. Esta entrega implementa chamados de suporte; não libera Appmax em produção nem substitui a homologação dos provedores externos.

## Onde acessar

- Administradora: **Sistema → Suporte**. Acesso disponível também na área restrita de cobrança elegível à recuperação Appmax.
- Profissional: **Suporte** no cabeçalho da agenda individual; acompanha somente chamados que abriu.
- DEV: **Atendimento** na navegação do console; acompanha todos os estúdios, com busca por assunto, protocolo e estúdio, filtros de estado, prioridade e atendente.
- Setup inicial: **Preciso de ajuda** abre a central sem concluir ou descartar a configuração.
- Sino: respostas, novos chamados e alterações chegam como notificações internas com link direto e leitura persistente por usuário. Não é necessário contratar outro provedor.

## Atendimento

Cada chamado possui protocolo sequencial `SUP-000001`, assunto, categoria, impacto, responsável, estados, conversa e histórico de alterações. Não há edição ou exclusão de mensagens na interface.

| Estado | Uso |
| --- | --- |
| Novo | Chamado aberto pelo estúdio |
| Em atendimento | Trabalho em andamento ou nova resposta do estúdio |
| Aguardando você/estúdio | A equipe respondeu e aguarda retorno |
| Aguardando análise | Dependência ou investigação |
| Resolvido | Solução apresentada; o estúdio pode reabrir |
| Encerrado | Fechamento definitivo pelo DEV após resolução; nova demanda usa outro protocolo |

Respostas públicas do DEV registram a primeira resposta e passam o chamado para espera. Respostas do estúdio reabrem chamados pendentes ou resolvidos. Notas internas não contam como primeira resposta e são visíveis somente no host DEV. O console informa metas internas de primeira resposta por prioridade: baixa 48 h, normal 24 h, alta 12 h, urgente 4 h, em horas corridas. São indicadores operacionais, não um SLA contratual garantido; não há equipe ou cobertura 24 horas criada pelo software.

A administradora acompanha todos os chamados de seu estúdio; profissionais acompanham somente os próprios. Clientes finais não acessam essa central. Notas e anexos privados são bloqueados também na API, não apenas escondidos na tela.

## Notificações

- Novo chamado ou resposta do estúdio: contas DEV existentes.
- Resposta pública ou atualização pelo DEV: administradoras do estúdio e autora do chamado, excluindo a conta que praticou a ação.
- Nota interna: equipe DEV, nunca o estúdio.
- Atribuição: atendente selecionado recebe aviso específico.
- Leitura e notificações ficam no SQLite e sobrevivem a nova sessão. O sino consulta a cada 25 segundos; a central consulta a cada 20 segundos quando a aba está visível. Não depende de uma conexão WebSocket permanente.
- As notificações anteriores de agenda e cobrança continuam na interface. Sua lógica anterior não foi convertida em notificações persistentes por este release.
- Não há envio externo automático de e-mail, push ou WhatsApp pelo suporte nesta entrega.

## Segurança e persistência

Migração **44**, aplicada na inicialização. Tabelas: `support_tickets`, `support_messages`, `support_attachments`, `support_reads`, `support_notifications`, `support_commands`. As capturas ficam como BLOB no SQLite, incluídas no backup consistente existente. Não se publicam arquivos em diretório estático.

Todos os endpoints exigem sessão opaca válida. DEV exige também o host DEV. ADMIN/STAFF exigem correspondência do host e estúdio. Recuperação de cobrança admite somente rotas explicitamente enumeradas para ADMIN; suspensão manual, conta desativada e STAFF bloqueada continuam sem acesso.

Escritas usam transações, chave UUID de idempotência e controle de versão. Um envio repetido não duplica a conversa. Uma alteração concorrente recebe HTTP 409; o formulário preserva o texto e pede revisão do histórico. Há limitação persistente de 30 mutações/minuto/usuário, 20 chamados ativos/estúdio e 1.000 entradas de histórico/chamado.

Anexos: até três PNG/JPEG/WebP por mensagem. O navegador reencoda as imagens em WebP, reduz dimensão e elimina metadados; cada anexo enviado aceita até 350 KiB. Há orçamento de 10 MiB de anexos/chamado e 50 MiB/estúdio; ao atingir o limite, o atendimento continua por texto. A API valida tamanho, base64 canônico e assinatura binária. O download exige acesso ao chamado e à visibilidade da mensagem, com `nosniff`, `Content-Disposition: attachment` e política sandbox. Não aceita SVG, HTML, PDF ou executáveis. A validação de assinatura não é um antivírus; o arquivo não é executado ou servido inline.

## Verificações reproduzíveis

```bash
npm ci
npm run check
# Playwright é dependência opcional de QA, instalada separadamente:
VITE_DEV_HOST=dev.localhost npm run build
npm run test:support-ui
python scripts/check-multistaff-live.py --project .
python scripts/check-product-upgrade.py --old /caminho/5.12.7 --new . --expected-old 43 --expected-new 44
```

`server/support/support.test.ts` usa banco descartável com todas as migrações, sessões reais e os middlewares de autenticação e host. Verifica isolamento, notas/anexos privados, idempotência, concorrência, estados, leitura, recuperação de cobrança e limites.

`scripts/check-support-ui.mjs` usa o cliente compilado, rotas reais de suporte, SQLite migrado, cookies opacos e hosts locais distintos para estúdio e DEV. Endpoints auxiliares de dashboard e documentos são fixtures. Verifica abertura ADMIN/STAFF, resposta e nota DEV, navegação por notificação, rascunho após conflito, resolução/reabertura, busca e layouts móveis. Appmax/Evolution externos não fazem parte desse teste.

## Resultado desta execução local

- `npm run check`: aprovado integralmente, incluindo TypeScript, ESLint, auditorias, build e 222 testes Node (162 principais, 14 de migração, 11 de primitivas de segurança e 35 de WhatsApp).
- Suporte: 18 testes dentro da suíte principal; incluem snapshot de leitura com mais de 50 notificações, backup de anexo privado e limite de armazenamento sem interromper respostas de texto.
- Navegador: 9/9 verificações aprovadas com suporte real, banco descartável e sessões opacas; layouts desktop, celular e tablet.
- Fluxos de equipe existentes: 49/49 verificações HTTP locais aprovadas.
- Atualização 5.12.7 → 5.12.8: banco 43 → 44 migrações, preservação de dados, integridade de chaves estrangeiras e restauração de backup aprovados.
- Não houve execução contra serviços reais de pagamento/WhatsApp ou deploy em produção nesta entrega.

## Homologação antes do deploy

Fable 5.1 e Opus 5 podem executar os scripts e revisar o fluxo; o aceite depende dos resultados, não do nome do modelo. Em staging, testar com contas reais autorizadas de dois estúdios e dois atendentes DEV, celular, anexo de screenshot, expiração de sessão, interrupção da rede e novo login. Confirmar backup/restauração com chamados existentes e capacidade de armazenamento.

Após deploy autorizado, repetir um ticket sintético de ponta a ponta: abrir como administradora, localizar no DEV, atribuir, responder, receber notificação, marcar leitura, resolver, reabrir e encerrar. Confirmar que outro estúdio, uma cliente e uma profissional não autora não acessam o ticket; a nota interna deve permanecer privada. Remover dados de teste conforme procedimento operacional, sem alterar banco de produção improvisadamente.

Homologação de pagamento Appmax, WhatsApp/Evolution, regras comerciais pendentes e revisão final de infraestrutura continuam necessárias antes de declarar a plataforma inteira pronta para produção. Esta entrega não promete integridade de 100% nem afirma que houve deploy.

## Referências do fluxo

- Zendesk, estados e reabertura após resposta da solicitante: https://support.zendesk.com/hc/en-us/articles/4408825550490-Why-does-my-ticket-status-change-to-open-automatically
- Zendesk, separação de comentários públicos e privados: https://support.zendesk.com/hc/en-us/articles/4408835109018-Changing-a-ticket-comment-from-public-to-private

O sistema é implementado no próprio projeto, sem dependência do Zendesk.
