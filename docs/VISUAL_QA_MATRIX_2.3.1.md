# Matriz visual manual — 2.3.1

## Evidência desta revisão

As 15 capturas fornecidas foram auditadas manualmente e mapeadas para contratos globais. A validação automatizada verifica estrutura, breakpoints, semântica e ausência dos padrões que causavam os regressos. A renderização final ainda deve ser homologada nos navegadores-alvo antes da publicação.

| Superfície | Reparo aplicado | Gate manual de publicação |
| --- | --- | --- |
| Header/hero da landing | hierarquia compacta, copy curta, oferta anual | 1440×900, 1280×720, 390×844 |
| Títulos da landing | escala e `text-wrap` balanceados | zoom 80%, 100%, 125%, 150% |
| Acesso ao espaço | layout dividido + mobile dedicado | teclado, erro de slug, domínio longo |
| Setup em quatro passos | altura compacta, scroll interno, footer estável | 390×844 e landscape de baixa altura |
| Uploads | decoder fallback + orçamento base64 | PNG/JPEG/WebP, transparência e 12 MB |
| Sidebar recolhida | 82 px, labels fora do fluxo, sem scroll horizontal | desktop e retorno após reload |
| Modais/forms | overlay por inset e scrollbar estável | todos os 10 diálogos em quatro zooms |
| Dashboard | máscara contínua entre fundo e foto | desktop, tablet e mobile |
| Domínio próprio | prefixo não colapsável | 320 px, 390 px e zoom 150% |
| Luma | página compacta, launcher discreto e drawer padrão | carregando, erro, limite e conversa longa |
| Product Tour | Phosphor Compass | sobreposição com modal e drawer |
| WhatsApp | fluxo de cliente apenas por QR | sem config global, QR, conectado, erro |
| Preços | quatro opções inline e checkout por ciclo | total/equivalente, Pix/cartão, retorno |
| Cenários ilustrativos | disclosure explícito | substituir por relatos autorizados quando existirem |

## Critérios de aceite

- zero overflow horizontal;
- nenhum título ou ação cortada;
- overlay cobre integralmente o viewport visual;
- abrir/editar/fechar modal não desloca o conteúdo atrás;
- foco, Escape e Tab funcionam em todos os diálogos;
- setup manual conclui com a IA desligada;
- cliente nunca vê URL, provider ou API key da Evolution;
- valores exibidos na landing e checkout coincidem com a API.
