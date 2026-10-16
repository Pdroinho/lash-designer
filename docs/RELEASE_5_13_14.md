# 5.13.14 — Logo automática e sugestões alinhadas no chat lateral

O seletor “Fundo e margens” foi removido das configurações do estúdio e do setup inicial. A usuária não precisa escolher entre remover fundo, limpar resíduos ou cortar margens. O envio continua executando o tratamento automático da imagem antes da análise da marca e da prévia.

Permanecem os ajustes de apresentação (símbolo com nome ou logo completa), tamanho, troca/remoção da imagem e salvamento explícito. A Luma continua sugerindo apresentação e cores. Se a preparação falhar, o fluxo existente preserva a imagem original; o esgotamento da análise não impede salvar a logo. Os modos de processamento continuam disponíveis no servidor para as ferramentas de edição da Luma, sem o seletor técnico na interface.

O componente do seletor e o estado usado exclusivamente por ele foram retirados. A chamada automática compartilhada foi mantida em `src/lib/brandImage.ts`. Não há alteração em permissões, contratos HTTP, cobrança de análise ou banco; a migração atual continua sendo a 49. Inclui os refinamentos de login e Luma das versões anteriores.

## Sugestões no chat lateral da Luma

Os quatro botões do chat lateral passam a formar uma grade compacta de duas colunas, com larguras iguais e até 340px no conjunto. Rótulos visíveis: Agenda, Financeiro, Suporte e Lembretes. Os nomes acessíveis continuam descrevendo a ação completa, e os pedidos enviados à Luma não mudam. A página principal mantém as sugestões da versão anterior. No mobile, o cabeçalho organiza o contador em duas linhas e oculta o selo AI redundante para preservar o nome Luma e os controles de histórico/fechar.

## Validação local

- `npm run check`: TypeScript, lint, 299 testes, auditorias e build aprovados.
- `npm run test:logo-preparation-ui`: 16 verificações em Chromium. Confirma remoção real de fundo e margens na imagem de teste, envio da imagem preparada à análise, salvamento da mesma prévia e ausência do seletor. Configurações em 1440, 768, 390 e 320px; setup em 1440 e 320px. Inclui verificações anteriores do carregamento e título do login.
- `npm run test:settings-brand-ui`: 10 verificações de análise, bloqueio do salvamento durante processamento, persistência de apresentação/paleta, esgotamento de cota e arquivo inválido.
- `npm run test:luma-clean-ui`: 10 verificações; página em seis combinações de largura/altura, chat lateral em 1440, 390 e 320px. Confirma duas colunas, larguras iguais, nomes curtos e nome Luma em uma linha, além de histórico, exemplos e campo de mensagem.
- `npm run test:luma-integrated-ui`: 21 verificações com rotas reais e SQLite temporário; provedores externos simulados, sem cobrança ou envio de mensagens externos.
- Build e lint executados novamente após os ajustes finais da Luma.
- Prévias de desktop e mobile conferidas visualmente. Nenhum erro não tratado no navegador.

Os testes usam cliente compilado, processamento local real de pixels e respostas simuladas do provedor de IA. Não executam deploy nem homologação do provedor externo. Depois de publicar, conferir o envio de uma logo real, a prévia e o salvamento na conta do estúdio.
