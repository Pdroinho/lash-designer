# 5.12.9 — Landing e contratação alinhadas ao produto atual

Base: 5.12.8, incluindo a central de suporte. Sem nova migração: permanece a versão 44 do banco.

## Causa do problema

O catálogo público e a landing escolhiam os planos comerciais conforme a disponibilidade do gateway Appmax. Sem Appmax habilitada, reapareciam os ciclos antigos, os preços anteriores e a promoção de R$ 39,90. Durante o carregamento ou em falha de rede, a página também podia exibir a oferta antiga. O checkout repetia esse comportamento.

O catálogo comercial agora é independente da disponibilidade do pagamento. Sempre publica as três faixas mensais. `checkoutAvailable` indica se a contratação pode prosseguir; não altera os valores publicados. O campo de compatibilidade `teamCheckoutEnabled` identifica o modelo de equipe, não a autorização para cobrar.

| Profissionais | Valor mensal por estúdio |
| --- | --- |
| 1 a 3 | R$ 74,90 |
| 4 a 6 | R$ 99,90 |
| 7 a 15 | R$ 149,00 |

## Landing revisada

- Hero e agendamento explicam escolha do serviço, profissional e horário pelo link do estúdio.
- Nova seção diferencia administradora, profissional e cliente: gestão central, agenda individual e agendamento pelo celular.
- Administradora gerencia o WhatsApp compartilhado; profissionais não recebem acesso administrativo ao WhatsApp ou aos dados financeiros.
- Agendamento menciona busca de serviços, disponível no produto para catálogos com seis ou mais serviços.
- Suporte por tickets aparece entre os recursos e no FAQ, com respostas e notificações no painel.
- Luma permanece opcional e com limites de uso exibidos no painel; não se promete IA ilimitada.
- Oferta, FAQ, CTAs e checkout usam três planos mensais. Foram removidos da landing e do checkout público os ciclos antigos, a promoção de entrada e a sugestão de teste gratuito.
- Banner de retorno do pagamento informa verificação, sem considerar o parâmetro da URL prova de pagamento.
- Layout e identidade existentes foram preservados; a seção de equipe usa a mesma linguagem visual.
- Links para pular o conteúdo continuam disponíveis por foco do teclado e ficam ocultos normalmente, inclusive com movimento reduzido.

## Contratação segura

Mesmo com API indisponível, lenta ou antiga, os valores atuais ficam visíveis. Nesses casos, o botão de pagamento permanece bloqueado, com uma mensagem de indisponibilidade. Não há retorno automático à oferta InfinitePay.

O plano clicado na landing é selecionado na contratação e mantém o mesmo valor no resumo. O POST público da interface usa somente `/api/public/onboarding/team-checkout`. A disponibilidade e o preço cobrado continuam validados pelo servidor. Nenhum pagamento real foi criado nesta revisão.

Os endpoints e cálculos legados do backend foram preservados para compatibilidade com contas e pedidos anteriores; não são anunciados pela landing. Este release não pretende reescrever o histórico financeiro de clientes existentes.

## Verificações

Execução local: `npm run check` aprovado, com 224 testes Node (164 principais, 14 de migração, 11 de segurança e 35 de WhatsApp), auditorias e build. A verificação de navegador passou em 11/11 casos, com catálogo real local e falhas simuladas. Desktop e celular também foram inspecionados visualmente.

- Comparação automatizada dos três planos publicados no cliente e servidor, rejeição de catálogo antigo/inválido/duplicado e ordenação estável.
- Teste HTTP do catálogo com gateway indisponível e disponível, sempre mantendo as três faixas atuais.
- `npm run check`: TypeScript, ESLint, testes, auditorias e build.
- `npm run test:landing-team-ui`: cliente compilado com catálogo real local. Desktop e celular, Appmax disponível/indisponível, falha de API, resposta antiga e carregamento lento. Verifica preços, três cards, copy de equipe, plano selecionado, total, bloqueio de cobrança e ausência de overflow/erros de navegador.

Para repetir a verificação de navegador, instalar Playwright separadamente e executar:

```bash
npm ci
VITE_DEV_HOST=dev.localhost npm run build
npm run test:landing-team-ui
```

O endereço DEV local é configuração de QA, não o domínio a publicar. No deploy, usar o domínio real e as variáveis do ambiente. A revisão local não altera o site já publicado; é necessário instalar esta versão para atualizar a landing em produção. A disponibilidade real da Appmax continua dependendo da configuração e homologação do gateway.
