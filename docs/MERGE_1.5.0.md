# Fusão seletiva 1.5.0

Data: **6 de agosto de 2026**.

## Objetivo

Consolidar a landing page, o SEO, a configuração comercial e os controles de produção do release 1.3.0 com as melhorias de acessibilidade, responsividade e robustez de interface encontradas no pacote 1.4.0 fornecido para comparação.

A fusão foi seletiva porque o pacote 1.4.0 não era uma continuação linear do 1.3.0: ele continha melhorias reais de produto, mas também removia componentes e validações essenciais do release comercial.

## Melhorias incorporadas do pacote 1.4.0

- navegação lateral convertida para botões semânticos com `aria-current`;
- botões do frontend com `type` explícito para evitar submissões acidentais;
- menu e popovers fecháveis por `Escape`;
- seleção de serviços, horários, datas e eventos mais operável por teclado;
- controles de dia aberto, almoço, upload de capa e exibição de senha acessíveis;
- botão “Ver todos” do dashboard conectado à agenda real;
- remoção de ações fictícias sem implementação;
- fallback de cópia quando Clipboard API não está disponível;
- links externos endurecidos com `noopener noreferrer`;
- cliente HTTP usando `Headers`, preservando cabeçalhos e respeitando `FormData`;
- sincronização de `color-scheme` e `theme-color` com tema e cor do tenant;
- imagens com `decoding="async"`;
- melhorias de mobile, safe area, bottom sheets, overflow, touch targets e reduced motion;
- largura máxima de conteúdo em monitores grandes e proteção de tabelas/cards em telas estreitas;
- metadados seguros de referrer e detecção de telefone;
- link global para saltar ao conteúdo.

## Recursos preservados do release 1.3.0

- landing page premium e suas 20 variantes WebP;
- rota `/landing` para prévia no hostname DEV;
- página de localização/acesso ao espaço;
- SEO dinâmico no servidor, com indexação exclusiva da raiz comercial;
- teste automatizado de SEO;
- preço comercial centralizado por ambiente;
- validação de igualdade entre preço do frontend e backend;
- `VITE_SALES_URL` e links legais/suporte obrigatórios no preflight;
- domínios personalizados, tours, cobrança e infraestrutura de produção;
- `.env.example`, documentação e manifestos completos da 1.3.0.

## Regressões do pacote 1.4.0 que não foram incorporadas

- remoção da landing e de seus assets;
- remoção de `seo.ts` e `seo.test.ts`;
- substituição do HTML dinâmico por `sendFile` genérico;
- preço anual fixado em `R$ 147` dentro do componente;
- remoção das variáveis e verificações comerciais do schema/preflight;
- remoção de variáveis da tipagem Vite;
- remoção de `.env.example`;
- redução do conjunto de testes críticos.

## Resultado

O release 1.5.0 mantém a arquitetura comercial e operacional da 1.3.0 e incorpora o acabamento de produto da 1.4.0 sem aceitar suas regressões.
