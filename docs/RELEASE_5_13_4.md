# Lash Designer 5.13.4 — WhatsApp sem troca prematura de telas

Base completa: 5.13.3. Banco permanece na migração 48; nenhuma mudança em planos, marca, equipe ou integrações externas.

## Correção

Antes, `connectionState=null` era interpretado como desconectado no primeiro render, enquanto a requisição de status ainda estava em andamento. Isso montava a tela de conexão por um instante, mesmo para um WhatsApp conectado.

Agora existe um estado explícito de consulta inicial: badge neutro “Verificando…” e carregamento acessível. Os cartões de conexão e QR Code só são montados após a consulta terminar. Quando conectado, entram diretamente as conversas; quando desconectado, entra a conexão. Erros mantêm a identificação de status não verificado e permitem tentar novamente. Consultas de atualização de um estado já confirmado mantêm a tela enquanto aguardam; não se força novo carregamento a cada polling.

Um contador de requisições descarta respostas antigas, inclusive após limpeza do efeito. A consulta de conexão termina em `finally`, evitando carregamento preso após falha. Componentes e estilos existentes reutilizados.

## Validação

- `npm run check`: TypeScript, lint, 276 testes automatizados, auditorias e build de produção.
- `npm run test:report-ux-ui`: 20 verificações de navegador, incluindo seis novos cenários com a resposta de status retida manualmente: conectado/desconectado em 1440, 390 e 320 px. Durante a espera, não há cartões de conexão, QR Code, conversas ou abas prematuramente montados.
- Observador de alterações do DOM verifica que o ramo de conexão não foi inserido antes da resposta e nunca foi inserido no caminho inicial conectado. Após liberar a resposta, a tela correta fica disponível.
- Casos existentes de QR Code, erro de consulta e recuperação continuam cobertos. APIs externas são fixtures nessa suíte; nenhum envio real ou mudança de estado de uma instância Evolution foi realizado.

## Homologação

Com Fable 5.1 e Opus 5, repetir a entrada direta em WhatsApp e a navegação entre abas com uma instância conectada/desconectada, rede lenta, erro e retomada. Validar desktop/mobile no ambiente de testes e após publicação com conta de teste. Usar o procedimento de backup e rollback de `CLAUDE.md`.

ZIP completo, com assets da 5.13.3; sem dependências, build, bancos, credenciais ou capturas internas. Não houve deploy nesta entrega.
