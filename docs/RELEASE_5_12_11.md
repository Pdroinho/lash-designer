# 5.12.11 — Correções de interface após relatório executivo

Base: pacote 5.12.10. Banco continua na migração 44. Não exige recriar estúdios, apagar dados ou alterar preços.

## Correções

- **Acesso da cliente:** restaura o CSS ausente do formulário passwordless. Card com largura limitada, campos e botão com alvos de toque adequados, estados de telefone/código, erro acessível e contexto do número destinatário. Enter envia o formulário; trocar número e reenviar respeitam o estado ocupado. Identidade recebida pela API aparece também quando a tela não recebeu o estúdio por props.
- **WhatsApp:** comparação exata dos estados do provedor. `disconnected` e `not_connected` não destravam a inbox. A tela desconectada apresenta apenas a conexão, com instruções para ler o QR; diagnósticos de recebimento aparecem depois de conectar. Falha na consulta fica explícita, bloqueia o CTA até nova verificação e permite recuperar. Retorno sem QR também mostra orientação, em vez de deixar o clique sem feedback.
- **Domínios:** selo reflete o carregamento e os domínios efetivamente ativos. Sem cadastro não há “DNS verificado”. Falha na listagem não vira “Nenhum domínio conectado”; há erro e nova tentativa. Cadastro bloqueado enquanto não há uma listagem confiável.
- **Assinatura:** remove o launcher flutuante da Luma nessa aba para não cobrir a ação persistente de checkout.
- **Luma:** contador móvel mantém a descrição visível de consultas diárias restantes.
- **Indicações:** diferencia convite para assinar a plataforma do link para clientes agendarem. Métricas deixam de chamar assinaturas pagas de “cliques”. O checkout por equipe já não aplicava descontos de indicação nem créditos; agora o painel informa isso, identifica os créditos antigos e bloqueia a criação pelo painel de novos links com promessa de benefício. Não altera nem apaga o histórico. O endpoint de overview declara `teamDiscountsAvailable: false`. A integração financeira desse programa ao checkout atual permanece pendente; não foi criada uma nova regra de descontos neste release.
- **Falhas em indicações:** mostra erro com recuperação, em vez de skeleton permanente. Criar/copiar link distingue erro de clipboard de erro de criação.
- **Financeiro:** não inventa crescimento de 100% quando o mês anterior não tem entradas. Meta zero é apresentada como “Definir meta”, em vez de um percentual sem denominador válido.

## Escopo e homologação

O relatório recebido documenta capturas externas; esta execução não acessou a VPS nem modificou produção. O código da versão enviada é a base verificada. Alterações feitas diretamente no servidor precisam ser comparadas antes de implantar.

`test:report-ux-ui` exercita o cliente compilado em Chromium com API fixtures: formulário/OTP, estados de conexão e QR, falha e recuperação de status, domínios vazios/ativos/erro, ausência de sobreposição de Luma na assinatura, indicação indisponível, rótulo da Luma e percentuais financeiros sem base. Esses testes não enviam mensagens ou pagamentos externos.

Os demais testes locais e seus resultados são registrados na entrega. A documentação `REVISAO_RELATORIO_EXECUTIVO_5_12_10.md` separa evidência visual, leitura do código e alegações sem demonstração reproduzível.

## Resultados em 13/10/2026

- `npm run check`: aprovado (TypeScript, ESLint, auditorias, build; 228 testes automatizados: 168 principais + 14 migrações + 11 primitivas + 35 WhatsApp).
- Navegador: 44 verificações aprovadas (14 diagnóstico/UX, 15 suporte/portal, 11 assinatura, 4 recuperação). API fixtures explicitadas nos scripts.
- HTTP no servidor compilado com SQLite descartável: 53 verificações aprovadas.
- Atualização 5.12.10 → 5.12.11: 4 verificações de abertura do banco, backup e restauração aprovadas; 44 migrações.
- Conferência visual de acesso cliente, WhatsApp, domínios, assinatura, indicações, Luma e financeiro no celular e fluxo desktop. Screenshots usadas apenas na inspeção interna.

Não houve deploy, cobrança externa, envio real de WhatsApp ou teste de capacidade nesta execução.
