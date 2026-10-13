# Lash Designer 5.12.7 — Recuperação de cobrança e agenda STAFF

Base: ZIP 5.12.6, SHA-256 `4523361c87143f6cc0cfcd0cda8b5efd9c59f14f04a91470fa038b6cd61a46fa`.
Validação local realizada em 11/10/2026, com Node 22.23.3. Nenhum deploy realizado.

## Correções

1. **Conta criada, checkout falhou:** tenants Appmax em `ONBOARDING` podem ser identificados no host para autenticação e cobrança. A ADMIN entra pelo fluxo real de senha + MFA e retoma o checkout. O acesso é restrito no servidor; agendas, convites, dados de clientes, WhatsApp, STAFF e CLIENT ficam bloqueados enquanto o estúdio não estiver ativo. O modo de teste não remove essa restrição.
2. **Novo pagamento após estorno:** a migração aditiva 43 registra `tenants.suspension_reason`. Suspensões causadas pela Appmax recebem `APPMAX`; pagamento novo e verificado ativa a assinatura e o estúdio na mesma transação. A confirmação repetida de um pedido estornado não reativa acesso. Um pagamento também não remove bloqueios manuais ou `DISABLED`. A ação DEV de alterar o status substitui a causa anterior, inclusive ao reafirmar `SUSPENDED`.
3. **Data da agenda STAFF:** datas vazias, parciais e impossíveis recebem feedback sem lançar exceção. Consultas anteriores são canceladas e respostas antigas são ignoradas após trocar o dia ou desmontar a tela. A agenda deixa de mostrar resultados do dia anterior durante a nova consulta. Os limites do dia seguem o calendário local, inclusive transições de horário de verão.
4. **Cobrança e identificação da entrega:** os planos Appmax podem ser apresentados mesmo quando a consulta do faturamento legado falha; o fallback legado oferece nova tentativa em vez de skeleton infinito. Na área restrita, a confirmação do pagamento é percebida por consulta periódica e recarregamento. Manifesto e lockfile agora identificam a entrega como `5.12.7`.

## Verificações executadas

- `npm run check`: TypeScript, lint, 144 testes da suíte principal, auditorias estáticas, suites de migração/segurança/WhatsApp e build aprovados. As outras suites executaram 14, 11 e 35 testes, sem falhas.
- `scripts/check-multistaff-live.py`: 49 verificações HTTP com processo real e banco descartável aprovadas.
- `scripts/check-product-upgrade.py`: banco 5.12.6 com 42 migrações → 5.12.7 com 43; preservação de dado de controle, ausência de violações de foreign key, backup, restore e reinício aprovados.
- `server/tenantRecovery.test.ts`: cadastro com falha do provedor, senha e OTP, sessão real, isolamento de host, recuperação ADMIN, bloqueio STAFF, assinatura pendente, confirmação, estorno, recompra, replay antigo e suspensão manual via router DEV. Appmax e transporte WhatsApp são simulados; códigos e sessões são gerados e verificados pelo código real.
- `npm run test:recovery-ui`: Chromium, build de produção, APIs de fixture isoladas, 1440×900, 390×844 e 768×1024. Data vazia, retorno para hoje, resposta fora de ordem, ausência de erro de página e overflow horizontal aprovados. Cobrança ADMIN no celular aprovada com overview legado indisponível e `test_mode` ativo, mantendo o bloqueio operacional.

## Reproduzir

```bash
npm ci
npm run check
python3 scripts/check-multistaff-live.py --project "$PWD"
python3 scripts/check-product-upgrade.py --old /caminho/5.12.6 --new "$PWD" --expected-old 42 --expected-new 43
```

O projeto antigo e o novo precisam estar compilados para o teste de upgrade. Para o teste opcional de navegador, instale Playwright no ambiente de QA sem modificar manifesto/lockfile e disponibilize Chromium:

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:recovery-ui
```

O script aceita `LASH_QA_PLAYWRIGHT_MODULE` (módulo Playwright em URI de arquivo) e `LASH_QA_CHROMIUM_PATH` (executável Chromium) quando o ambiente já fornece essas ferramentas. Não são dependências de execução da plataforma.

## Limites e próxima etapa

- Appmax continua desligada por padrão e bloqueada em produção. Pagamento sandbox real, entrega de OTP pela Evolution API e testes integrais em staging ainda são necessários.
- Upgrade/downgrade de períodos pagos, política econômica de indicações, estorno parcial e recuperação de chargeback continuam pendentes; não foram definidos silenciosamente neste pacote.
- Estúdios já suspensos antes da migração 43 não recebem uma causa presumida. Não é possível distinguir retrospectivamente um estorno de uma suspensão manual usando apenas o status antigo. Esses casos precisam de revisão DEV; não há reativação automática de bloqueios ambíguos.
- Antes de atualizar produção, parar o processo, fazer backup consistente e validar rollback. A migração 43 é aditiva. Restaurar um backup e reiniciar apenas uma instância por banco.
- O handoff para Fable 5.1 e Opus 5 inclui os cenários novos e depende das credenciais e permissões de cada ambiente. Testes locais não garantem ausência total de problemas nem substituem homologação real.
