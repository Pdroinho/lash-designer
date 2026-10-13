# Revisão crítica do relatório externo 5.12.9

Fonte: PDF de homologação e print anexados pelo usuário em 12/10/2026. Conferência contra o ZIP 5.12.9 entregue neste projeto. Este documento não altera o relatório original e não afirma acesso à VPS, às credenciais ou à API merchant de produção.

O relatório tem boa organização visual e cobre um fluxo de uso plausível com capturas. Entretanto, sua conclusão de aprovação integral extrapola as evidências apresentadas. O print separado mostra a administração de usuários montada junto com Atendimento, falha reproduzida e corrigida na 5.12.10.

## Matriz de confronto

| Afirmação/evidência | Resultado da conferência | Ação/evidência necessária |
| --- | --- | --- |
| Atendimento DEV separado de Configurações | Falha real: o último ramo da renderização era um `else` genérico e também montava `DevUsers` no suporte | Corrigido; teste de navegador cobre a URL da raiz, ausência de formulário e ida/volta a Configurações |
| Planos atuais em toda a plataforma | Landing correta, mas Assinatura ADMIN ainda voltava à oferta antiga quando Appmax estava indisponível | Corrigido; catálogo e preços atuais permanecem visíveis com cobrança bloqueada |
| Nome da profissional nas mensagens WhatsApp | Ausente no código 5.12.9, apesar da resposta pública descrita no relatório | Corrigido: `{{profissional}}` e complemento seguro para templates antigos, com join isolado por estúdio |
| Cliente vinculada automaticamente à inbox após agendar | Não havia chamada central na criação do agendamento 5.12.9 | Corrigido: upsert do contato na transação, preservando histórico, não lidos e consentimento |
| Portal identifica a profissional | O endpoint e a tela não expunham o nome | Corrigido; desktop/celular também usam o fuso do estúdio e distinguem falha de API de agenda vazia |
| Pix de R$ 5,00 homologa contratação TEAM_3 de R$ 74,90 | Um teste de baixo valor não demonstra o pagamento do plano oficial. A implementação exige valor pago exatamente igual ao da intenção | Exigir identificação de ambiente, vínculo link/pedido/intenção e resposta merchant redigida. Não reduzir preço ou remover validação para fazer teste passar |
| Credenciais de produção / pronto para vendas | O relatório afirma produção, mas o checklist final ainda pede trocar credenciais sandbox | Confirmar ambiente efetivo e configuração do processo implantado; não deduzir pelo endereço do checkout |
| Evidência 25 rotulada como resposta pública e nota gravadas | A captura mostra chamado Novo e a mensagem da administradora, sem demonstrar a gravação da resposta/nota | Registrar antes/depois e respostas de API, em vez de inferir a operação pela legenda |
| `is_internal=1` / `is_internal=0` | Esses campos não existem no esquema entregue | O projeto usa `visibility='INTERNAL'/'PUBLIC'`; acesso é controlado no serviço e no host DEV |
| Protocolo sequencial por tenant | O ID do ticket é global no SQLite | O protocolo `SUP-000001` é global; o escopo de leitura é por estúdio/papel |
| Dados pessoais automaticamente ocultados em anexos | Não implementado | Há reencode WebP e retirada de metadados; a pessoa deve ocultar dados no conteúdo da captura. Não há detector/redator automático |
| Push imediato e sincronização instantânea | O projeto usa consulta periódica | Sino a cada 25 s e central a cada 20 s, com pausa em aba oculta. Persistência não é WebSocket/push em tempo real |
| Vite SSR | Não corresponde ao pacote | Cliente React SPA compilado e servido pelo Express |
| Agenda verifica cabine junto da profissional | Não há modelagem de cabines/recursos físicos no pacote | Profissionais têm disponibilidade própria; não anunciar gestão de cabines |
| 28–35 MB por sessão e redução de 82% | Não comprovado pelo código/capturas de UI | Medir processo/heap/RSS sob carga, reconexões e histórico; configuração aplicada externamente à Evolution não está demonstrada pelo ZIP |
| 1.000 estúdios com estabilidade absoluta | Não há ensaio de carga apresentado | Precisa de cenário representativo, p95/p99, simultaneidade, latência, filas, reconexões, disco e falhas |
| Margem de 99,13% | É uma proporção entre receita hipotética e infraestrutura estimada | Não é margem líquida nem incorpora gateway, impostos, IA, pessoal, aquisição, suporte, reembolsos e outros custos |
| Scripts de hibernação, limpeza em 7 dias e disco abaixo de 40% | Não demonstrados pelo pacote de aplicação ou métricas | Solicitar scripts/timers/configuração reais e logs; não assumir instalados a partir da descrição |
| Duas VPS já separadas | O relatório recomenda a topologia, não comprova sua implantação | Pacote mantém SPA/API/SQLite/workers juntos; Evolution é endpoint externo. Conferir configuração efetiva dos hosts |
| 224 testes aprovam toda produção | São testes de escopos distintos e não prova universal | Registrar commit, comandos, ambiente, saída, cobertura e testes reais separados. Sucesso finito não dá garantia de 100% |

## Antes de aprovar o ambiente real

Fable 5.1 e Opus 5 podem executar a homologação, mas cada conclusão precisa de evidência reproduzível. Registrar a versão/commit efetivamente instalado e comparar com este ZIP, especialmente se houve alterações diretamente na VPS. Preservar os ajustes externos válidos; não sobrescrever uma instalação modificada sem conferência.

Repetir: navegação DEV sem formulário de usuários no suporte; leitura e resposta em tickets com duas contas de estúdios distintos; retorno de ticket inexistente no celular; assinatura ADMIN sem fallback de preço; agendamento por duas profissionais; contato criado sem mensagem ou opt-in promocional artificial; nome da profissional na confirmação/lembrete; portal da cliente com fuso correto; falha de rede e tentativa novamente.

Confirmar separadamente pagamento real pelo valor contratado, reversão, MFA/dispositivo confiável, restauração e métricas de capacidade. Usar dados sintéticos e evidências redigidas. Este pacote não realizou nenhuma cobrança real ou implantação na VPS.
