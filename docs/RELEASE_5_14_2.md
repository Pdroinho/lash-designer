# 5.14.2 — Agendamento mobile com a identidade da versão desktop

A revisão anterior compactou a página, mas deixou a apresentação genérica. Esta versão recupera a linguagem visual do produto: tipografia editorial, fotografia dos serviços, seleção de profissionais com avatares e uma confirmação com acabamento de comprovante. As alterações de composição ficam no mobile e na transição para tablet; o cabeçalho desktop e a posição original da marca permanecem.

## Composição e uso

- Serviços em um grid visível de duas colunas no celular e até três no tablet, sem carrossel que esconda opções. Fotos com proporção definida, nomes completos, duração, preço e seta discreta. Um único resultado da busca ocupa a largura disponível, com foto lateral. A limpeza da busca usa um botão acessível no padrão da plataforma, em vez do controle nativo do navegador.
- Navegação com nomes curtos das etapas, progresso e áreas de toque. O título usa Fraunces, a mesma fonte editorial da plataforma, com tamanho controlado para cada largura.
- O serviço escolhido vira uma faixa com foto e ação explícita para alterar. A etapa de horário também informa profissional e data, sem vários boxes concorrentes.
- Profissionais em cards com os avatares existentes e um único rádio de seleção. A opção sem preferência continua disponível. Em equipes grandes, a lista expansível tem rolagem limitada para manter o calendário alcançável; nome e foto opcionais continuam preservados.
- Datas compactas, indicação de deslizar e horários em grupos por período. Os horários são botões simples, legíveis e com foco visível.
- Resumo da reserva com foto, serviço, dia/horário, profissional e valor antes dos campos. Nome e WhatsApp mantêm os componentes, validação e formatação existentes. O consentimento de campanhas segue opcional e desmarcado.
- Confirmação com indicador discreto, título editorial e comprovante com os dados reais retornados pela reserva. A fotografia aparece como detalhe, sem ocupar a tela inteira.
- Fluxo e botões continuam utilizáveis nas menores larguras. Trocas de etapa voltam ao topo e movem o foco ao título; falhas ao reservar permanecem explícitas.

## Fontes e consistência da revisão

As fontes originais Manrope e Fraunces passam a ser servidas localmente em WOFF2, com os subconjuntos latino e latino estendido. Não houve troca de família tipográfica. Os arquivos vieram da distribuição oficial Google Fonts, com os avisos SIL Open Font License em `public/fonts/`. As duas fontes principais têm preload no HTML; a aplicação não depende da requisição ao Google Fonts para exibir sua identidade.

Isso também corrige uma limitação das capturas locais anteriores: sem o carregamento externo, elas exibiam fontes substitutas. A revisão desta entrega foi feita com as fontes originais carregadas. A auditoria agora verifica preload local, assinatura dos arquivos WOFF2 e presença das licenças.

## Verificação

- `npm run check`: TypeScript, lint, 309 testes automatizados, auditorias e build de produção aprovados. Os últimos ajustes receberam novo build, lint e verificação no navegador.
- `npm run test:booking-mobile-ui`: 12/12 verificações; reserva completa em 320, 360, 390, 430, 768, 820 e 1440 px, com as fontes originais e emulação touch/DPR 2, validação de nome e telefone, consentimento desmarcado, conflito de horário, confirmação e nova reserva. Também verifica busca com/sem resultados, serviço com nome longo, quinze profissionais, profissional única e erro no catálogo.
- Revisão de marca: 30/30 verificações em login, agendamento e painel, com logos completas e símbolo/nome nos três tamanhos.
- Regressões gerais de interface: 70/70 verificações, incluindo navegação por teclado, checkbox com um único check, temas e layout desktop, além das demais áreas da plataforma.
- Capturas das etapas e variantes foram inspecionadas visualmente. Elas são evidência interna de teste e não fazem parte do pacote.

As verificações de navegador usam o frontend compilado com APIs locais controladas. Os testes do check incluem as rotas e regras existentes de reserva. Esta execução não publica a aplicação nem agenda em um estúdio real. Homologue também em Safari/iPhone e Chrome/Android reais antes do deploy, com a marca, catálogo e equipe do ambiente.

Não há migração nova: o banco permanece na versão 50. As correções anteriores de Luma, lembretes, campanhas e recuperação de senha continuam no pacote.
