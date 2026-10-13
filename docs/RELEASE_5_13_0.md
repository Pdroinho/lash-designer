# Release 5.13.0 — Luma integrada e equipe refinada

Base: 5.12.14. Banco: migrações 46 e 47. Planos mensais mantidos: 1–3 profissionais R$ 74,90; 4–6 R$ 99,90; 7–15 R$ 149,00.

## Produto

- Equipe e suporte usam controles compartilhados, calendário do produto, botões, cartões e estados consistentes; fluxos testados até 320px.
- Administradora pode corrigir o WhatsApp de convites pendentes e contas de profissionais. Contas existentes precisam entrar novamente; sessões e desafios MFA pendentes são invalidados. Telefone da administradora permanece nas configurações de segurança.
- Remover da equipe exige confirmação, bloqueia acesso, invalida convites e libera a vaga. O registro histórico fica preservado fora da lista de membros; não equivale a apagar dados de atendimentos. Atendimentos futuros devem ser reagendados/cancelados antes. A administradora não pode ser removida por esse fluxo.
- Luma: Conversar, Minha rotina, Financeiro, Meus pedidos, Lembretes e Do meu jeito. Ações que alteram dados passam por revisão e confirmação, com expiração, isolamento de estúdio/usuária e proteção contra confirmação duplicada.
- Rotina consulta períodos de até 93 dias, com paginação e fuso do estúdio. Comparecimento real é separado da confirmação antecipada. A marcação manual pode registrar veio/faltou ou ser retirada.
- Luma prepara chamados, respostas públicas, lançamentos, correções financeiras e metas. Resumos de suporte consultam pedidos reais; notificações continuam no sistema de suporte existente. O módulo Financeiro visual é reutilizado.
- Lembretes pessoais de WhatsApp, com data/hora escolhidas, usam Evolution e apenas o telefone cadastrado da administradora. Envio incerto fica identificado e não é reenviado automaticamente. Aceite do provedor não comprova entrega ao telefone. Não há promessa de rotina recorrente nesta versão.
- Preferências de tom, foco e instruções são salvas por usuária/estúdio; não alteram permissões. Histórico local da conversa também tem esse escopo.
- Novas compras de créditos usam checkout Appmax. 25 créditos custam R$ 5,00 devido ao mínimo de R$ 5,00 do provedor; 100 custam R$ 12,90 e 250 R$ 24,90. Pedidos antigos conservam reconciliação legada. Créditos extras permitem continuar após o limite incluído, com estorno e liberação idempotente verificados.
- Resumo da assinatura e textos do Product Tour foram atualizados. Contas com tour antigo concluído não recebem nova abertura automática; a ajuda manual usa os passos atuais.

## Validação e limites

269 testes automatizados (incluindo 28 novos de operações e créditos); 21 cenários práticos de equipe, 16 de suporte, 11 de assinatura e 20 integrados de Luma no Chromium; 53 verificações HTTP locais; migração de banco da base 45 para 47 e restauração de backup verificadas. O teste integrado usa rotas reais, SQLite e sessões; IA, Appmax e Evolution são provedores locais simulados. Os testes de assinatura usam fixtures de API.

Essas evidências não homologam credenciais, pagamento real, modelo remoto, WhatsApp externo ou produção. Configurar os provedores, executar preflight e seguir CLAUDE.md antes do deploy. Não existe garantia técnica de 100% de integridade.

Appmax: https://docs.appmax.com.br/api-reference/payment-links/criar-link-pagamento

## Reprodução

Node 22, npm ci, npm run check. Build com VITE_DEV_HOST=dev.localhost para os testes locais de navegador. Rodar npm run test:team-ui, test:support-ui, test:billing-ui e test:luma-integrated-ui, com Playwright/Chromium instalados. Scripts Python: check-multistaff-live.py --project <projeto>; check-product-upgrade.py --old <base> --new <novo> --expected-old 45 --expected-new 47.

O ZIP contém fontes e assets; dependências, dist, bancos, credenciais e capturas internas de teste não são entregues.
