# 5.14.0 — Conversas salvas, lembretes e campanhas com imagem

## Luma

Abrir um item do histórico restaura as mensagens salvas; não repete a pergunta, não chama o modelo e não consome créditos. O histórico agora guarda até oito conversas, com até vinte mensagens por conversa, separado por estúdio/usuária neste navegador. Os registros antigos que guardavam somente perguntas continuam acessíveis como perguntas antigas, sem inventar as respostas que não foram armazenadas.

O botão comum de abertura da Luma deixa o campo vazio. A ação específica de sugerir uma resposta a uma cliente do WhatsApp continua podendo fornecer o contexto que a própria usuária pediu. Abrir, fechar e consultar histórico não confirma ações nem cria lembretes. Durante uma resposta em andamento, o histórico fica indisponível para evitar misturar conversas.

Prévias de edição de logo não são gravadas no histórico do navegador para evitar exceder a cota de armazenamento. Se uma prévia ainda não aplicada for reaberta depois de recarregar, a interface pede uma nova preparação em vez de oferecer confirmação sem a imagem. As descrições e os resultados já executados são preservados.

## Meus lembretes

Nova seção do WhatsApp para consultar e filtrar os lembretes pessoais criados pela Luma, acompanhar o estado, cancelar itens agendados e preparar um novo. Usa as mesmas ações confirmadas, dados, telefone da administradora e fuso do estúdio; não cria um segundo sistema de lembretes. A listagem atualiza após ações no chat e periodicamente enquanto a tela está visível, priorizando os itens ainda agendados. A consulta continua isolada por estúdio e usuária e retorna até cem registros.

## Campanhas

Editor simplificado com mensagem, personalização dos nomes, imagem opcional, prévia e confirmação. Removidas as instruções de flags/servidor, o teste para um número arbitrário e a necessidade de entender um “modelo promocional” para preparar a campanha. O controle de ativação da instalação permanece no servidor; não é contornado.

A fila revalida consentimento, aplica limites por conta e contato, evita envios simultâneos e interrompe a campanha se a aceitação ficar incerta. Campanhas antigas expiram em vez de serem enviadas fora de contexto. A seção de campanhas usa os componentes de formulário, notificação e confirmação existentes. A confirmação mobile foi corrigida para manter texto e botões em uma coluna. As abas do WhatsApp acomodam a nova seção com rolagem horizontal no celular e mantêm a aba ativa visível.

Leia [a operação, os limites e a distinção entre QR/Baileys e a API oficial](WHATSAPP_CAMPAIGNS_5_14_0.md). Não existe garantia contra bloqueios e a integração Cloud com templates aprovados não faz parte desta entrega.

## Verificação

- `npm run check`: TypeScript, lint, 309 testes, auditorias e build aprovados. Inclui concorrência de workers, cadência, orçamento diário, frequência por contato, suspensão, consentimento/cancelamento durante consulta ao provedor, interrupção/reinício sem replay, expiração e imagem. Inclui migração que preserva o histórico de tentativas, decodificação/regravação da imagem, contrato do envio de mídia e rejeição de texto personalizado longo.
- `npm run test:luma-integrated-ui`: 25 verificações em Chromium com cliente compilado, rotas reais, SQLite e sessões reais. Histórico atual e antigo sem reenvio, abertura sem prompt, lembretes consultados/cancelados pelo painel e campanhas com imagem criada/normalizada/cancelada após confirmação. Interface conferida em desktop e celular. IA, Appmax e Evolution usam simuladores locais.
- `scripts/check-product-upgrade.py --expected-old 49 --expected-new 50`: quatro verificações de inicialização da versão anterior, backup, atualização com preservação dos dados e restauração em processo novo.
- Build e lint repetidos após os ajustes finais de navegação/interface. Sem deploy ou envio a contatos reais nesta execução.

Para publicação, seguir a validação de provedor, migração e rollback descrita no documento operacional. Os arquivos de captura usados na revisão permanecem fora do pacote.
