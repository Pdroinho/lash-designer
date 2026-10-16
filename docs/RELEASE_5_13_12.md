# 5.13.12 — Login mobile mais limpo

## Mudança de interface

O acesso no celular mantém a foto, a identidade do estúdio e o formulário existente. Até 780px, a foto passa a ser um cabeçalho compacto (156 a 200px), com a marca em destaque. A frase promocional, a assinatura da plataforma, o identificador do estúdio e o subtítulo redundante deixam de aparecer nessa composição.

O formulário ocupa a largura disponível com margens de 20 a 24px e limite de 440px no tablet. A grade não cria faixas laterais nem um espaço vazio entre a foto e o painel. As orientações de primeiro acesso recebem menor peso visual; suporte, quando configurado, e documentos legais mantêm alvos de toque de 44px. A tela continua rolável em alturas menores e respeita os espaços seguros do dispositivo.

A composição do desktop permanece com foto lateral, frase, identificação e formulário. O componente compartilhado de marca mantém os modos logo completa e símbolo com nome e os três tamanhos já configuráveis. Não há alteração do agendamento público, regras de autenticação, contratos HTTP ou banco de dados; a migração mais recente continua sendo a 49.

## Validação local

- `npm run check`: TypeScript, lint, 299 testes automatizados, auditorias e build aprovados. Após o ajuste final das grades, build e lint executados novamente.
- `npm run test:login-mobile-ui`: 12 verificações em Chromium, com cliente compilado e API simulada. Login em 320×640, 390×844, 430×932, 768×900 e 1440×900; ausência de transbordamento horizontal, cabeçalho ocupando a largura, campos com margens equilibradas, botão Entrar visível sem rolagem inicial, título em uma linha, checkbox, abertura da recuperação e retorno preservando o e-mail. Inclui seis combinações de apresentação/tamanho da marca com nome longo na menor largura.
- `npm run test:password-recovery-ui`: 13 verificações do cliente compilado com rotas reais, SQLite temporário e sessões reais; transporte WhatsApp global simulado. Inclui código inválido, confirmação de senha, troca da senha e entrada automática, sem enviar mensagens externas.
- `npm run test:brand-presentation-ui`: 30 verificações de setup e marca em login, agendamento e painel, incluindo logo completa/símbolo, tamanhos S/M/L, quatro larguras e fallback do provedor.
- Prévia visual conferida em celular, com logo completa e símbolo com nome, e desktop.

Para repetir os testes de navegador, disponibilize Playwright e Chromium compatíveis. Os scripts aceitam `LASH_QA_PLAYWRIGHT_MODULE` e `LASH_QA_CHROMIUM_PATH`; o teste de apresentação da marca também aceita `LASH_QA_MULTIPROCESS=true`. As capturas opcionais usam `LASH_QA_SCREENSHOT_DIR` e devem permanecer fora do pacote de produção.

## Conferência após publicação

Validar no aparelho real o login com e sem teclado aberto, exibição da marca do estúdio, recuperação de senha pelo WhatsApp global e retorno ao painel. Conferir o link de suporte se configurado. Esta entrega não executou deploy nem homologou transporte externo; os testes locais não substituem essa conferência.
