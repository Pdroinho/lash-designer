# 5.13.13 — Refinamento visual da Luma

A tela da Luma tinha título de até 54px, texto introdutório longo e sugestões distribuídas em uma grade larga. Regras antigas ainda atribuíam largura especial ao último botão e criavam cards de 88px em um carrossel mobile. O nome Luma também recebia indevidamente o estilo do selo AI.

## Interface

- Título entre 21,6 e 30px na página, com limite de 24px no chat lateral. Texto de apoio reduzido a uma frase.
- Quatro sugestões mantidas, agora com os componentes `btn btn-ghost` existentes, tamanho conforme o conteúdo e quebra de linhas entre os botões. Removidos o ícone repetido no início e a largura especial do último item. Alvos de toque de pelo menos 44px sem largura forçada ou carrossel.
- Retiradas as repetições “Luma AI”, “Pergunte à Luma”, a lista de áreas no campo e o aviso permanente de formatos de imagem. O campo continua com rótulo acessível, anexo, prévia, remoção da imagem, envio e interrupção de resposta.
- Campo de mensagem com fundo sólido e sombra discreta. Nome Luma volta a ser texto de marca, sem a aparência de outro selo.
- Menu “O que posso pedir à Luma?” mantém os sete exemplos em uma área rolável com título fixo. Ao expandir, o campo de mensagem continua disponível. As alterações continuam exigindo a confirmação da usuária.
- Altura do chat ajustada para notebooks. A navegação mobile existente permanece preservada, com o campo acima dela.

Todo o trabalho permanece em uma conversa, incluindo histórico, créditos, chamados, agenda, financeiro, lembretes, preferências e edição de logo. Nenhuma alteração em APIs, permissões, banco ou integrações. A migração atual continua sendo a 49. Inclui as correções de login mobile da versão 5.13.12.

## Verificação local

- `npm run check`: TypeScript, lint, 299 testes, auditorias e build aprovados. Build e lint repetidos após os ajustes finais de interface.
- `npm run test:luma-clean-ui`: 9 verificações em Chromium com cliente compilado e APIs simuladas. Página em 1440×900, 1440×720, 1024×768, 768×900, 390×844 e 320×640; tipografia, botões conforme o conteúdo, toque, ausência de transbordamento horizontal, envio habilitado ao digitar, exemplos, preservação do campo ao expandir e histórico. Chat lateral aberto e fechado em 1440 e 390px. Prévias conferidas visualmente.
- `npm run test:luma-integrated-ui`: 21 verificações com rotas reais e SQLite temporário, incluindo agenda, comparecimento, abertura e atualização de chamado, financeiro com confirmação, preferências, lembretes, logo com prévia/aplicação/restauração, créditos e recuperação de erro. Provedores de IA, Appmax e Evolution simulados; sem cobranças ou mensagens externas.

Os testes aceitam `LASH_QA_PLAYWRIGHT_MODULE`, `LASH_QA_CHROMIUM_PATH` e `LASH_QA_MULTIPROCESS=true` para ambientes com Playwright/Chromium externos. Capturas opcionais ficam em `LASH_QA_SCREENSHOT_DIR`, fora do pacote.

Esta entrega não executa deploy. Após publicar, conferir a tela na conta e no aparelho reais, além da resposta do modelo e dos serviços externos com as credenciais de produção.
