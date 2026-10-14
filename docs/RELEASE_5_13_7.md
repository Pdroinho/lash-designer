# Lash Designer 5.13.7 — Logo centralizada e preparação de imagem pela Luma

Base completa: 5.13.6. Banco permanece na migração 48. Assets e funcionalidades anteriores preservados.

## Agendamento público

A marca ocupa uma faixa própria, centralizada acima das etapas. Removido o texto “Agendamento online”. Símbolo com nome e logo completa usam o mesmo TenantBrand e os tamanhos S/M/L existentes. O nome pode quebrar entre palavras quando necessário, sem fragmentar palavras comuns; a imagem mantém proporção e object-fit contain. No mobile, progresso e contador ficam juntos na faixa seguinte, sem uma linha vazia adicional.

## Edição no chat da Luma

Peça “remova o fundo da minha logo e ajuste as margens”. A ferramenta prepare_brand_image usa a logo atual ou um anexo do chat. O exemplo “Preparar minha logo” está na lista recolhível de capacidades, sem novas abas. A ação mostra uma prévia sobre fundo quadriculado e exige “Usar esta logo” antes de gravar. Depois da confirmação, o painel atualiza a marca sem recarregar a página. Outras páginas recebem a imagem persistida ao carregar.

Também é possível pedir apenas o recorte ou “restaure a logo original”. A última edição confirmada conserva um original no banco, inclusive depois de recarregar a aplicação. Ao substituir esse backup por uma nova edição, os pixels das edições mais antigas são removidos do histórico de ações; os registros e a idempotência permanecem. Prévia vencida não pode ser aplicada. Prévias idênticas pendentes são reutilizadas; imagens de prévias vencidas são descartadas na preparação seguinte.

Processamento real local com Sharp 0.34.5: PNG/JPEG/WebP estáticos, até 2 MB de entrada, limite de 8 milhões de pixels e saída PNG de até 450 kB. Não baixa URLs externas. Detecta fundo liso pelas bordas e remove pixels semelhantes conectados às bordas, preservando detalhes claros cercados pelo desenho. Logos já transparentes conservam o canal alpha. Retira margens vazias com 2 px de proteção; não redesenha cores nem inventa elementos. Imagens muito grandes podem ser reduzidas proporcionalmente até 1024 px.

**Limite explícito:** não é segmentação neural de fotografias. Fundos irregulares ou logos encostando nas bordas podem ser recusados com orientação para enviar uma imagem adequada. A usuária deve revisar detalhes finos e contornos na prévia. A ferramenta de chat não executa automaticamente durante o setup ou o upload em Configurações; a análise de paleta e apresentação dessas telas segue o fluxo 5.13.6.

Uso passa pela reserva e pelos limites existentes do chat, sem API externa de remoção de fundo. A ferramenta retorna apenas metadados ao modelo; os pixels da prévia e do backup não entram na mensagem de resultado da ferramenta enviada ao provedor. Anexos de chat continuam sujeitos ao envio visual existente ao modelo configurado. Ações pertencem ao tenant e à usuária, expiram em 15 minutos e são confirmadas em transação SQLite immediate. Mudança da logo após a prévia bloqueia sua aplicação. Confirmações repetidas não reexecutam.

## Validação local

- npm run check: TypeScript, lint, 284 testes automatizados, auditorias estruturais e build.
- Preparação de pixels: transparência, recorte, preservação de cor e detalhes brancos, fundo ambíguo, imagem vazia, URL externa e payload inválido.
- SQLite real: prévia sem alteração, isolamento por usuária, logo alterada após prévia, confirmação idempotente, restauração e expiração.
- Navegador: 30 verificações de marca/setup/painel/login/agendamento em 1440, 768, 390 e 320 px, incluindo centralização e ausência do texto removido.
- Chat integrado: 21 verificações com rotas/SQLite reais e provedores simulados, incluindo aplicação e restauração de logo em 1440, 390 e 320 px.
- 64 verificações HTTP com servidor real e banco temporário.

Não houve deploy nem validação do modelo principal, Appmax ou Evolution com credenciais reais. Testes de provedores usam respostas locais controladas.

## Homologação — Fable 5.1 e Opus 5 no Claude Code

Instalar com npm ci em Node 22; Sharp inclui binários nativos para a arquitetura de destino e deve ser instalado na VPS, sem copiar node_modules de outro sistema. Rodar npm run check e os scripts de navegador indicados em CLAUDE.md. Com o modelo real configurado, pedir remoção de fundo, recorte e restauração pelo chat, validar chamadas de ferramenta e revisão antes da aplicação. Testar logos transparentes, claras, escuras, completas, símbolos, JPEG com contornos suaves e fundos recusados. Revisar o resultado em configurações, painel, login e agendamento; conferir tenant isolado e contador da Luma. Fazer backup e rollback antes do deploy. Após publicar, repetir com contas de teste em produção e registrar evidências. Nenhuma capacidade de modelo substitui a execução dessas verificações ou garante 100% de integridade.
