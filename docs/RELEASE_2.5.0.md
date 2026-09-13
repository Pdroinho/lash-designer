# Release 2.5.0 — Public Experience Rebuild

A 2.5.0 reconstrói as superfícies que ficam na frente da cliente final e ajusta a landing para comunicar melhor o produto.

## Agendamento público

- refactor mobile-first completo das quatro etapas;
- seleção de serviço, data e horário avança sem CTA redundante;
- confirmação solicita somente nome e WhatsApp;
- nenhum e-mail, senha ou criação de conta para reservar;
- Product Tour removido do fluxo público;
- resumo progressivo do agendamento;
- sucesso pós-confirmação com acesso ao histórico e opção de novo agendamento;
- endpoint público com validações de serviço, agenda, bloqueios, antecedência, overlap e rate limit.

## Área da cliente

- login tradicional removido da entrada da cliente;
- acesso passwordless por WhatsApp quando não existe sessão válida;
- OTP de seis dígitos, curto, expirável e de uso único;
- limite de tentativas e rate limit;
- sessão persistente depois da confirmação;
- opção de reenviar o código ou trocar o número;
- gestão de senha removida da área CLIENT.

## Landing page

- header simplificado e com CTA de compra mais evidente;
- wordmark temporário refinado;
- prova social deixa o formato de “slide interno” e vira composição editorial;
- exemplos demonstrativos continuam explicitamente identificados;
- CTA final reconstruído;
- footer editorial escuro com arquitetura de navegação real;
- copy das seções alteradas para benefício/rotina, não descrição do próprio mockup.

## QA

- 31/31 cenários Chromium do novo fluxo aprovados;
- 15/15 auditoria específica de experiência da cliente;
- 26/26 responsividade;
- 22/22 sistema visual;
- 18/18 UX/overlays;
- 16/16 iconografia;
- 16/16 onboarding;
- 12/12 indicações.

Consulte `docs/CUSTOMER_EXPERIENCE_2.5.md` e `docs/VISUAL_QA_MATRIX_2.5.md`.
