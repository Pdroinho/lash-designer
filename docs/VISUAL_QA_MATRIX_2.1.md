# Matriz de homologação visual 2.1

Esta matriz existe para impedir que regressões como Product Tour sobre cobrança, modais sem fechamento, contraste insuficiente e layouts quebrados voltem a passar despercebidas.

## Viewports obrigatórios

- 320 × 568 — celular estreito;
- 360 × 800 — Android comum;
- 390 × 844 — iPhone moderno;
- 768 × 1024 — tablet vertical;
- 900 × 900 — transição drawer/sidebar;
- 1024 × 768 — notebook compacto;
- 1280 × 800 — desktop comum;
- 1440 × 900 — desktop amplo;
- zoom do navegador em 200%;
- celular em landscape com pouca altura útil.

## Estados transversais

Cada tela aplicável deve ser conferida em:

- carregando;
- vazia;
- com conteúdo curto;
- com conteúdo longo;
- erro de rede;
- sucesso;
- permissão negada;
- modal aberto;
- teclado móvel aberto;
- tema claro;
- tema escuro no console DEV;
- `prefers-reduced-motion`.

## Fluxos ADMIN

1. primeiro acesso sem assinatura;
2. assinatura inativa — somente billing e logout disponíveis;
3. seleção de ciclo e redirecionamento ao checkout;
4. pagamento pendente, aprovado e falho;
5. dashboard com assinatura ativa;
6. agenda mensal e semanal;
7. criação/edição de serviço;
8. clientes e detalhes;
9. financeiro, filtros e modais;
10. WhatsApp/Evolution;
11. Luma habilitada, sem cota e indisponível;
12. configurações, domínio e troca de senha;
13. Product Tour iniciado, pulado, concluído e reaberto.

## Regras invioláveis do Product Tour

- nunca iniciar em tenant sem assinatura ativa;
- nunca coexistir com billing bloqueado, modal, confirmação, drawer ou notificações;
- fechar automaticamente quando uma superfície transacional abrir;
- ficar abaixo de modais e acima somente do conteúdo normal;
- não bloquear pagamento, autenticação ou ações destrutivas;
- não reabrir automaticamente depois de dispensado.

## Fluxos DEV / super admin

- tenants ativos, inativos e sem assinatura;
- criação em duas etapas;
- edição e desativação;
- exclusão definitiva com confirmação textual;
- integrações globais;
- backups;
- métricas operacionais;
- tema claro e escuro com tenant claro, escuro e saturado;
- sidebar, tabelas e ações em mobile/tablet.

## Fluxos CLIENT e público

- login;
- área da cliente;
- lista vazia e preenchida de agendamentos;
- agendamento público completo;
- serviço sem imagem;
- datas sem horário;
- confirmação e erro;
- domínio personalizado;
- landing page e CTA.

## Critérios de aceite

- nenhum overflow horizontal do documento;
- nenhum texto cortado ou quebrado letra por letra;
- nenhum controle essencial fora da área visível;
- foco visível e ordem de Tab coerente;
- contraste mínimo WCAG AA para texto operacional;
- botão destrutivo não confundido com ação primária;
- ícones Phosphor consistentes, com rótulo quando o significado não for universal;
- conteúdo continua compreensível sem ícones;
- modais têm título, fechamento quando permitido, Escape, foco contido e rolagem interna;
- nenhuma ação visual sem efeito real.

## Evidência de release

Antes de publicação, salve screenshots ou vídeos curtos por perfil e viewport, registre navegador/SO e anexe os resultados ao ticket de release. Auditoria estática não substitui homologação visual em navegador real.
