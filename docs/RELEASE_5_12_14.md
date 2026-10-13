# 5.12.14 — Equipe independente e suporte mais simples

Base: pacote completo 5.12.13. Migração do banco permanece em 45; esta entrega não exige migração nova nem altera os preços vigentes.

## Equipe

A aba Equipe agora é independente de Serviços, disponível no menu da administradora e em Mais no celular. `/admin?view=team` abre diretamente a área. O catálogo de Serviços deixou de renderizar a gestão de profissionais. A implementação anterior em `ProfessionalManager.tsx` foi removida; os novos componentes ficam em `src/features/team/`.

A listagem apresenta profissionais, serviços, rotina e situação do acesso ao painel, com busca, filtros e vagas disponíveis. O cadastro tem três etapas: nome, escolha explícita dos serviços e horários. Serviços exibem nome, duração e preço para distinguir itens semelhantes. Horários gerais são apresentados antes da escolha; personalizar começa com os horários reais do estúdio. É possível cadastrar vários períodos no mesmo dia. Calendário, seletores de horário e interruptores têm aparência da plataforma e nomes acessíveis.

Cadastro não cria acesso ao painel automaticamente. Convidar é uma ação opcional; o link deve ser copiado e enviado pela responsável. Convites pendentes são identificados, e gerar outro invalida o anterior. Contas de profissionais podem ser suspensas e restauradas. A conta ADMIN é identificada e protegida contra suspensão pelo endpoint STAFF. WhatsApp continua compartilhado pelo estúdio e gerido pela administradora.

Folgas usam o fuso configurado no estúdio, mesmo quando o navegador usa outro. O backend mantém a proteção contra conflitos com atendimentos e folgas existentes; agora também rejeita intervalos de horários sobrepostos. Desativar exige confirmação e continua bloqueado quando há atendimentos futuros. O histórico é preservado. A interface bloqueia fechamento/troca de painel durante uma gravação.

## Suporte para usuárias

“Pedir ajuda” abre um formulário simples; assunto, descrição e imagem opcional ficam em evidência. Categoria e urgência usam linguagem cotidiana e ficam em detalhes opcionais. Erros de preenchimento aparecem dentro da interface, sem balões nativos de validação do navegador.

“Meus pedidos” mostra uma lista clara. Ao abrir um pedido, a conversa ocupa a área principal e explica o próximo passo: pedido recebido, equipe analisando, aguardando resposta da usuária, resolvido ou encerrado. Mensagens de “Você” e da “Equipe de suporte” têm estilos distintos. O botão “Responder ao atendimento” leva diretamente ao campo de mensagem. Busca, retorno à lista, anexos, histórico, notificações, resolução e reabertura permanecem funcionais.

O painel DEV conserva filtros operacionais, responsável, prioridade e notas internas. As notas internas não são exibidas para ADMIN/STAFF. Foram preservadas idempotência e proteção contra versões concorrentes; rascunhos sobrevivem a conflitos de resposta.

## Controles e navegação

Caixas de seleção e opções de escolha usam as cores do produto mantendo os inputs reais, aceite obrigatório, leitura por tecnologias assistivas e teclado. O convite de profissional foi conferido com teclado. A navegação da administradora usa “Início” e “Seu estúdio”. O atalho flutuante da Luma não aparece na Equipe e não cobre as ações.

## Verificação local

- `npm run check`: aprovado, com 241 testes (181 principais, 14 migrações, 11 primitivas e 35 WhatsApp), auditorias, TypeScript, ESLint e build. TypeScript, lint e build também executados após os últimos ajustes.
- `npm run test:team-ui`: 17 verificações práticas com cliente compilado, rotas reais, sessões opacas e SQLite descartável. Cadastro, validação, limites, convite pendente, checkbox acessível, folga em fuso diferente do navegador, liberação, proteção de ADMIN, recusa atômica de horários sobrepostos, desativação segura, filtros e separação de Serviços.
- `npm run test:support-ui`: 16 verificações com rotas reais e SQLite: formulário/erro simples, imagem otimizada, leitura DEV, nota interna, resposta pública, notificações, conflito concorrente sem perda de rascunho, resolver/reabrir, pedido inexistente, busca, suporte STAFF e portal.
- `npm run test:report-ux-ui`: 14 verificações com fixtures; `npm run test:recovery-ui`: 4. Total desta entrega: 51 verificações no navegador, sem erros não tratados.
- `scripts/check-multistaff-live.py`: 53 verificações HTTP com servidor compilado e banco descartável.
- `scripts/check-product-upgrade.py`: 4 verificações de abertura da versão anterior, backup, atualização 5.12.13 → 5.12.14 e restauração, sem perda de dados; migração 45 → 45.
- Equipe e horários inspecionados em 1440, 768, 390 e 320 px; ações visíveis, sem overflow horizontal. Horários devem permanecer inteiramente legíveis, inclusive em 320 px. Capturas usadas somente na revisão interna.

Os testes de navegador identificam endpoints reais e fixtures em seus cabeçalhos. Eles não chamam Appmax nem Evolution externos. Não houve deploy ou verificação de produção nesta execução. Esta entrega redesenha Equipe e Suporte e padroniza os controles mencionados; não declara que todas as demais telas receberam um redesenho completo.

## Homologação externa e deploy

Claude Code, com Fable 5.1 e Opus 5, deve seguir `CLAUDE.md` e os roteiros existentes. Testar localmente os fluxos completos, depois validar Appmax, WhatsApp/Evolution e códigos de acesso com contas e credenciais de homologação. Fazer backup antes do deploy autorizado e repetir os fluxos após a publicação, incluindo permissões entre estúdios, calendário/portal, equipe, convites, suporte/notificações e cobrança. Registrar evidências e pendências reais; não prometer integridade absoluta apenas por passar nas suítes locais.
