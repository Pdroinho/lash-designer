# Lash Designer 5.13.5 — Configurações por assunto

Base completa: 5.13.4. Migração permanece em 48; backend, dados e preços preservados.

## Organização

- **Seu espaço:** nome, logo, apresentação/tamanho da marca e cor principal.
- **Segurança:** senha, WhatsApp de segurança, dispositivos, sessões e preferências de comunicação/termos.
- **Endereço:** domínio personalizado, endereço público e verificações.
- **Pagamentos:** reutiliza `BillingCenter`, a mesma área atual de assinatura, faixas por equipe e histórico de pagamentos do menu Assinatura.

O resumo antigo dentro de Configurações ainda declarava plano anual e foi removido junto de seu carregamento duplicado. Os registros de pagamentos não foram removidos: continuam disponíveis no componente atual de cobrança. A tela não cria um segundo sistema de planos ou checkout.

## Usabilidade

Padrão visual `ld-agenda-tabs`/`ld-agenda-tab` reutilizado. Desktop mantém abas em uma linha; mobile mostra as quatro opções em duas linhas, sem esconder assuntos em um carrossel horizontal. Apenas um painel aparece por vez. Seções são montadas na primeira visita e ficam preservadas, ocultas, nas visitas seguintes; a troca de aba não perde campos digitados nem seleções. Formulários de segurança, domínio e pagamentos não são consultados antes de abrir sua seção.

Abas com `role=tablist`, `role=tab`, seleção única, relação `aria-controls`/`aria-labelledby`, foco por setas, Home e End. Painéis inativos usam `hidden` e não expõem seus botões, campos ou CTA fixo de pagamento na tela. O nome do espaço recebeu associação explícita entre rótulo e input. O tour de Configurações apresenta as novas abas, sem apontar para um domínio oculto.

## Validação

- `npm run check`: TypeScript, lint, 276 testes automatizados, auditorias estruturais e build aprovados.
- `npm run test:settings-tabs-ui`: 13 verificações em 1440, 768, 390 e 320 px. Inclui uma seção visível por vez, carga sob demanda, preservação dos rascunhos de marca e senha, cobrança mensal atual, ausência de CTA de pagamentos nas outras abas, setas/Home/End e foco único.
- `npm run test:report-ux-ui`: 20 verificações, incluindo estados de domínio e recuperação de erro após abrir sua nova aba; correção anterior de carregamento do WhatsApp preservada.
- Capturas de marca, segurança, endereço e pagamentos inspecionadas durante a revisão de interface. Sem overflow horizontal nos tamanhos testados; captura interna excluída do ZIP.

APIs dessas suítes de navegador são fixtures. Nenhuma senha real, cobrança, domínio ou instância WhatsApp foi alterada. Não houve deploy nesta entrega.

## Homologação

Fable 5.1 e Opus 5: seguir `CLAUDE.md`, repetir as quatro abas com conta de teste, salvar marca, testar senha e dispositivos, fluxo de domínio, planos por equipe e comprovantes. Conferir navegação por teclado, celular e troca de abas durante preenchimento. Após publicar, repetir na produção com contas de teste, registrar evidências e manter backup/rollback.

ZIP completo com assets da base; sem dependências, build, bancos, credenciais ou capturas internas.
