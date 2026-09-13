# Rebuild visual 2.0

## Objetivo

O release 2.0 substitui correções visuais isoladas por um contrato único para superfícies, cabeçalhos, formulários, modais, navegação e estados de feedback. A prioridade é remover layouts frágeis e decisões locais que se contradiziam entre telas.

## Contratos obrigatórios

### Modais

- desktop: largura limitada pelo conteúdo e pelo viewport, nunca pelo tamanho arbitrário da tela;
- altura máxima baseada em `dvh`, com cabeçalho e rodapé estáveis;
- celular: bottom sheet com safe areas e rolagem apenas no corpo;
- fechamento visível, `Escape`, foco preso e devolução de foco;
- rodapé com uma ação primária e, no máximo, uma secundária;
- sufixos, ajuda e validação ficam fora do campo, sem sobreposição.

### Formulários

- label persistente;
- ajuda abaixo do label ou do campo;
- erro sem deslocamentos abruptos;
- addons usam grid próprio;
- campos nunca dependem de ícones para explicar significado;
- ações destrutivas ficam em zona separada.

### Navegação

- sidebar fixa somente quando existe largura útil;
- drawer em tablet compacto e celular;
- topbar mantém identidade, contexto e ação principal sem colisão;
- seleção usa contraste, tipografia e indicador lateral, não bolhas decorativas.

### Cards e páginas

- títulos, descrições, métricas e ações seguem a mesma hierarquia;
- grids usam `minmax()` e colapsam sem larguras mágicas;
- tabelas preservam conteúdo com scroll controlado ou alternativa móvel real;
- empty states possuem mensagem, contexto e próxima ação;
- nenhum componente deve criar overflow horizontal do documento.

## Áreas reconstruídas

- criação e edição de espaços;
- painel DEV e visão operacional da plataforma;
- assinatura e histórico de pagamento;
- assistente Luma;
- modais e confirmações destrutivas;
- navegação, topbar, cards, formulários e estados de carregamento;
- layouts mobile, tablet, desktop compacto e telas largas.

## Matriz mínima de homologação

Testar cada fluxo em 320×720, 375×812, 390×844, 768×900, 1024×768, 1280×720 e 1440×900. Validar também celular em landscape, zoom de 200%, teclado virtual e `prefers-reduced-motion`.
