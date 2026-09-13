# Lash Designer 3.9.0 RC — WhatsApp Reliability & Product Polish

## Escopo

Esta release evolui a base 3.8.0 sem reabrir módulos já estabilizados. O foco foi a Central de Relacionamento/WhatsApp: recebimento de mensagens, estabilidade do polling e scroll, identificação de contatos, estados vazios, automações de confirmação e acabamento das abas Conversas, Automações, Campanhas e Conexão.

## 1. Recebimento de mensagens (inbound)

### Causa encontrada
Na 3.8, a configuração do webhook da Evolution estava acoplada principalmente ao fluxo de confirmação automática de agendamento. Era possível iniciar uma conversa manual pela Central e enviar mensagens normalmente sem garantir que a instância tivesse o webhook de entrada preparado.

### Correções
- o status administrativo prepara/verifica o webhook quando a instância está conectada;
- a conexão via QR prepara o webhook assim que a instância existe;
- o envio manual também garante a preparação do webhook;
- parser inbound ampliado para estruturas de evento atuais, incluindo `remoteJidAlt` quando `remoteJid` usa `@lid`;
- grupos continuam ignorados;
- mensagens inbound continuam deduplicadas e persistidas no histórico próprio do Lash Designer;
- nova rota de diagnóstico informa se o webhook esperado está configurado e os horários da última mensagem recebida/enviada.

## 2. Polling e scroll

- removido `scrollIntoView()` do ciclo periódico;
- polling continua atualizando a inbox, mas não reposiciona o scroll global;
- viewport do chat é controlado localmente por `scrollTop`;
- ao abrir conversa ou enviar mensagem, o chat pode ir ao fim;
- mensagem nova só acompanha automaticamente quando a usuária já estava próxima do fim;
- polling pausa quando a aba do navegador está invisível.

## 3. Contatos e nova conversa

- modal de nova conversa agora coleta **Nome**, **WhatsApp** e **Primeira mensagem**;
- o nome informado é persistido junto à conversa/contato;
- telefone formatado passa a ser informação secundária;
- contatos ainda sem nome aparecem como **Contato sem nome**, evitando usar um número cru como título;
- busca continua aceitando nome ou número.

## 4. Empty state de Conversas

O estado anterior duplicava mensagens vazias entre coluna lateral e painel central. A 3.9 usa um único estado, ocupando a superfície inteira da inbox, com explicação curta e CTA **Nova conversa**. Painéis sem contexto não são exibidos antes de existir uma conversa selecionável.

## 5. Automações de confirmação

- o diagrama de tempos e os selects duplicados foram substituídos por um único fluxo editável;
- as três etapas ficam na mesma estrutura: pedir confirmação → lembrar → transformar em pendência;
- mensagem padrão passa a pedir somente `1` para confirmar ou `2` para avisar que não poderá comparecer;
- `{{codigo}}` deixou de ser exigido pelo backend e deixou de aparecer no fluxo normal;
- migração 29 troca apenas o default antigo com código, preservando mensagens personalizadas;
- o identificador interno permanece disponível apenas como fallback em situações realmente ambíguas;
- quando há mais de um compromisso aguardando resposta, o sistema prioriza o pedido de confirmação mais recentemente enviado quando isso resolve a ambiguidade.

## 6. Campanhas

- nova visão de audiência mostra quantas clientes possuem consentimento promocional ativo;
- estado operacional deixa claro que os modelos/testes existem, mas o broadcast em massa continua protegido;
- editor de mensagem, teste e salvamento foram reagrupados em uma composição mais densa e coerente;
- nenhuma campanha em massa foi liberada nesta release.

## 7. Conexão

- estado principal informa se a central está pronta para enviar e receber;
- diagnóstico de recebimento mostra última entrada e última saída;
- detalhes técnicos da instância ficam ocultos quando a infraestrutura é gerenciada pela plataforma;
- QR Code deixa de ser ação principal quando o WhatsApp já está conectado;
- conectado e saudável: a interface mostra que nenhuma ação é necessária.

## 8. Interface e responsividade

- nova camada `src/whatsapp-v39.css` substitui a 3.8;
- inbox desktop com hierarquia mais clara entre lista, conversa e contexto;
- tabs compactadas no mobile para as quatro áreas caberem sem corte;
- scrollbars locais possuem tratamento próprio;
- automações, campanhas e conexão ganharam densidade visual e estados completos;
- QA dedicado foi executado em desktop e mobile para cinco superfícies: conversa, vazio, automações, campanhas e conexão.

## 9. Validação

Auditorias concluídas:

- WhatsApp Center 3.9: **25/25**
- Appointment Lifecycle: **36/36**
- Financeiro: **22/22**
- Luma: **33/33**
- Responsividade: **26/26**
- UX/overlays: **18/18**
- Iconografia: **16/16**
- Sistema visual: **22/22**
- Onboarding: **16/16**
- Estrutural 2.4: **26/26**
- Customer Experience: **25/25**
- Marketing Consent: **15/15**
- Indicações: **12/12**
- Design System 3.3: contrato aprovado; dívida visual não aumentou
- QA visual dedicado WhatsApp: **10/10** casos, sem overflow horizontal involuntário
- Transpilação sintática isolada das áreas alteradas: aprovada

### Gate de dependências/build

O ambiente de execução não concluiu um `npm ci` íntegro: a tentativa de instalação foi interrompida pelo ambiente e deixou uma árvore parcial de dependências; por isso `npm run typecheck` ainda não conseguiu resolver `vite/client`. Esta release permanece corretamente marcada como **RC**. Em VPS/CI com registry funcional, o gate final continua sendo:

```bash
npm ci
npm run check
npm run preflight
```

Não há afirmação de build de produção aprovado enquanto esse gate externo não rodar com dependências completas.

## 10. Arquivos principais alterados

- `src/components/WhatsAppCenter.tsx`
- `src/whatsapp-v39.css`
- `src/main.tsx`
- `server/index.ts`
- `server/migrate.ts`
- `scripts/whatsapp-center-audit.mjs`
- `scripts/appointment-lifecycle-audit.mjs`
- `scripts/v39-whatsapp-visual-qa.py`
- `package.json`
- `package-lock.json`
- `ALTERACOES.md`

