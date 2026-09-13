# Profissionalização 1.4.0

Data: **5 de agosto de 2026**.

## Escopo

Esta rodada foi deliberadamente restrita a alterações de baixo risco e benefício claro. Regras de negócio, contratos de API, banco de dados, cobrança e autenticação não foram redesenhados.

## Melhorias aplicadas

### Estabilidade de interação

- 118 elementos `button` auditados; nenhum permanece sem atributo `type`.
- Prevenção de submissões involuntárias causadas pelo comportamento padrão de botões dentro de formulários.
- Botão “Ver todos” do dashboard conectado à aba real de agenda.
- Remoção do menu fictício da tabela de clientes.
- Elemento de botão usado apenas como mock visual convertido em conteúdo não interativo.
- Menus flutuantes podem ser fechados com `Escape`.

### Acessibilidade e teclado

- Seletores customizados convertidos para botões/listboxes com `aria-expanded`, `aria-selected` e estados de foco.
- Seletores de horário convertidos para controles semânticos.
- Switch de dia aberto/fechado e checkbox de almoço convertidos para controles reais.
- Datas, serviços e eventos do calendário operáveis por `Enter` e barra de espaço.
- Ações somente por ícone receberam nomes acessíveis.
- Controles de exibição de senha deixaram de ser removidos da ordem de tabulação.
- Upload de capa pode ser acionado por teclado.
- Link de salto para o conteúdo principal incluído.

### Robustez do navegador

- Cópia do link de agendamento possui fallback quando `navigator.clipboard` não está disponível.
- Falha de cópia agora gera feedback em vez de indicar sucesso incorretamente.
- `window.open` usa `noopener,noreferrer`.
- Metadados de `color-scheme`, referrer e detecção de telefone adicionados.
- Cor da barra do navegador e `color-scheme` sincronizados com o tema e a cor do tenant.
- Imagens configuradas com `decoding="async"`.

### Cliente HTTP

- Cabeçalhos agora são normalizados com `Headers`, preservando entradas fornecidas como objeto, array ou instância de `Headers`.
- `Content-Type` não é imposto sobre `FormData`, evitando quebra em futuros uploads multipart.
- O comportamento JSON existente foi preservado para as requisições atuais.

### CSS e mobile

- Resets visuais específicos para os controles convertidos de `div` para `button`.
- Foco visível consistente para teclado.
- Proteções de largura mínima e quebra de texto em cards, tabelas e formulários.
- `overscroll-behavior` em modais, popovers e menus.
- `scrollbar-gutter` em modais para reduzir deslocamento visual.
- Menus customizados limitados pela altura dinâmica da viewport no celular.
- Grade de serviços reduzida para uma coluna em telas estreitas.
- Ações de capa permanecem visíveis em dispositivos sem hover.

## Validações executadas

- Sintaxe TypeScript/TSX aprovada por transpilação isolada em todos os arquivos de `src/` e `server/`, exceto o arquivo declarativo `vite-env.d.ts`, que não gera saída JavaScript por definição.
- CSS analisado com PostCSS: **744 nós de nível superior**, sem erro de parsing.
- Todos os arquivos JSON analisados com sucesso.
- `backup.sh`, `healthcheck.sh` e `restore.sh` aprovados em `bash -n`.
- `scripts/preflight.mjs` aprovado em `node --check`.
- Auditoria JSX: **118 botões**, zero sem `type`, 12 imagens com `alt` explícito e seis links em nova aba com `rel` definido.
- Busca por `.env`, bancos, chaves privadas e padrões comuns de segredo não encontrou artefatos sensíveis no pacote.

## Limitação da validação

O comando `npm ci` não pôde ser concluído porque o espelho npm interno deste ambiente retornou `404` para `zod-validation-error-4.0.2.tgz`. Portanto, `npm run check` e o build real ainda precisam ser executados na VPS ou CI com acesso normal ao registro npm.

## Riscos estruturais mantidos

- `src/App.tsx` continua monolítico e grande.
- Ainda existem muitos estilos inline e seletores CSS redefinidos.
- Uma refatoração por feature/rota pode trazer benefícios, mas não foi incluída nesta rodada por ter risco de regressão superior ao escopo autorizado.
- A aprovação comercial final ainda exige teste visual real em 360, 390, 768, 1024, 1366 e 1920 px, além de Safari/iOS e Chrome/Android.
