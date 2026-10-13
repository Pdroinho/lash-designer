import { z } from 'zod'
export const operationTypes = [
  'CREATE_SUPPORT_TICKET',
  'REPLY_SUPPORT_TICKET',
  'REGISTER_FINANCE',
  'UPDATE_FINANCE_ENTRY',
  'UPDATE_FINANCE_GOALS',
  'RECORD_ATTENDANCE',
  'CREATE_REMINDER',
  'CANCEL_REMINDER',
  'UPDATE_LUMA_PREFERENCES',
] as const
export type OperationType = (typeof operationTypes)[number]
export const cashSchema = z
  .object({
    type: z.enum(['INCOME', 'EXPENSE']),
    amount_cents: z.number().int().positive().max(100000000),
    note: z.string().trim().min(2).max(400),
    date: z.string(),
    method: z.string().trim().min(1).max(40).default('MANUAL'),
  })
  .strict()
export const goalsSchema = z
  .object({
    revenue_goal_cents: z.number().int().min(0).max(100000000),
    new_clients_goal: z.number().int().min(0).max(100000),
  })
  .strict()
export const attendanceSchema = z
  .object({
    appointment_id: z.string().uuid(),
    attendance: z.enum(['ATTENDED', 'NO_SHOW', 'NOT_RECORDED']),
  })
  .strict()
export const reminderSchema = z
  .object({
    date: z.string(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    message: z.string().trim().min(3).max(800),
  })
  .strict()
export const preferencesSchema = z
  .object({
    tone: z.enum(['FRIENDLY', 'DIRECT', 'DETAILED']),
    focus: z.enum(['GENERAL', 'AGENDA', 'FINANCE', 'CLIENTS']),
    instructions: z.string().trim().max(1000),
  })
  .strict()
export const ticketSchema = z
  .object({
    subject: z.string().trim().min(5).max(160),
    body: z.string().trim().min(10).max(8000),
    category: z
      .enum([
        'ACCOUNT',
        'BILLING',
        'WHATSAPP',
        'BOOKING',
        'BUG',
        'FEATURE',
        'OTHER',
      ])
      .default('OTHER'),
  })
  .strict()
export const replySchema = z
  .object({
    ticket_id: z.number().int().positive(),
    body: z.string().trim().min(1).max(8000),
  })
  .strict()
const schemaProperties = {
  CREATE_SUPPORT_TICKET: {
    subject: { type: 'string' },
    body: { type: 'string' },
    category: {
      type: 'string',
      enum: [
        'ACCOUNT',
        'BILLING',
        'WHATSAPP',
        'BOOKING',
        'BUG',
        'FEATURE',
        'OTHER',
      ],
    },
  },
  REPLY_SUPPORT_TICKET: {
    ticket_id: { type: 'integer' },
    body: { type: 'string' },
  },
  REGISTER_FINANCE: {
    type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
    amount_cents: { type: 'integer' },
    note: { type: 'string' },
    date: { type: 'string' },
    method: { type: 'string' },
  },
  UPDATE_FINANCE_ENTRY: {
    transaction_id: { type: 'string' },
    type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
    amount_cents: { type: 'integer' },
    note: { type: 'string' },
    date: { type: 'string' },
    method: { type: 'string' },
  },
  UPDATE_FINANCE_GOALS: {
    revenue_goal_cents: { type: 'integer' },
    new_clients_goal: { type: 'integer' },
  },
  RECORD_ATTENDANCE: {
    appointment_id: { type: 'string' },
    attendance: {
      type: 'string',
      enum: ['ATTENDED', 'NO_SHOW', 'NOT_RECORDED'],
    },
  },
  CREATE_REMINDER: {
    date: { type: 'string' },
    time: { type: 'string' },
    message: { type: 'string' },
  },
  CANCEL_REMINDER: { reminder_id: { type: 'string' } },
  UPDATE_LUMA_PREFERENCES: {
    tone: { type: 'string', enum: ['FRIENDLY', 'DIRECT', 'DETAILED'] },
    focus: {
      type: 'string',
      enum: ['GENERAL', 'AGENDA', 'FINANCE', 'CLIENTS'],
    },
    instructions: { type: 'string' },
  },
}
export const operations: Record<
  OperationType,
  { name: string; description: string; label: string }
> = {
  CREATE_SUPPORT_TICKET: {
    name: 'prepare_support_ticket',
    description:
      'Prepara um pedido de ajuda para o suporte humano, com o relato aprovado pela usuária. Não inclui anexos nem dados sensíveis automaticamente.',
    label: 'Enviar pedido de ajuda',
  },
  REPLY_SUPPORT_TICKET: {
    name: 'prepare_support_reply',
    description:
      'Prepara uma resposta pública ao pedido de ajuda da usuária. Consulte o pedido e sua versão antes.',
    label: 'Enviar resposta ao suporte',
  },
  REGISTER_FINANCE: {
    name: 'prepare_finance_entry',
    description:
      'Prepara receita ou despesa manual em centavos, com data local, nota e método. Nunca duplica receita já contabilizada de agendamento; exige escolha explícita da usuária.',
    label: 'Salvar lançamento',
  },
  UPDATE_FINANCE_ENTRY: {
    name: 'prepare_finance_correction',
    description:
      'Prepara uma correção de receita ou despesa manual existente. Consulte get_finance_entries antes, localize o lançamento exato e confirme os valores. Protege contra alterações concorrentes.',
    label: 'Atualizar lançamento',
  },
  UPDATE_FINANCE_GOALS: {
    name: 'prepare_finance_goals',
    description: 'Prepara alteração das metas financeiras e de novas clientes.',
    label: 'Salvar metas',
  },
  RECORD_ATTENDANCE: {
    name: 'prepare_attendance',
    description:
      'Registra comparecimento real: veio, faltou ou retirar marcação. Não é confirmação antecipada de presença. Use apenas para atendimento que já começou, com informação explícita da usuária.',
    label: 'Registrar comparecimento',
  },
  CREATE_REMINDER: {
    name: 'prepare_whatsapp_reminder',
    description:
      'Agenda um lembrete pessoal no WhatsApp cadastrado da administradora via Evolution. Data/hora no fuso do estúdio. Não envia para clientes nem faz disparos em massa.',
    label: 'Agendar meu lembrete',
  },
  CANCEL_REMINDER: {
    name: 'prepare_cancel_reminder',
    description:
      'Prepara cancelamento de lembrete ainda agendado, da própria usuária.',
    label: 'Cancelar lembrete',
  },
  UPDATE_LUMA_PREFERENCES: {
    name: 'prepare_luma_preferences',
    description:
      'Personaliza tom, foco e orientações da Luma. Preferências não alteram permissões ou regras de confirmação.',
    label: 'Salvar preferências',
  },
}
export const operationalToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_finance_entries',
      description:
        'Consulta lançamentos financeiros manuais por texto da nota, por página de até 50 itens, para localizar uma correção. Não mistura receitas automáticas de agendamentos.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, page: { type: 'integer' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_calendar_period',
      description:
        'Agenda real em período escolhido, por profissional, com comparecimento e pendências. Até 93 dias; página de 50 registros; use page para continuar.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          page: { type: 'integer' },
        },
        required: ['start_date', 'end_date'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_support_requests',
      description:
        'Pedidos de ajuda reais da usuária, incluindo mensagens públicas. Jamais inclui notas internas do DEV.',
      parameters: {
        type: 'object',
        properties: {
          ticket_id: { type: 'integer' },
          after:{type:'integer'},
          page: { type: 'integer' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_personal_reminders',
      description:
        'Consulta os lembretes pessoais da usuária e seus estados de envio.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  ...operationTypes.map((type) => ({
    type: 'function',
    function: {
      name: operations[type].name,
      description: operations[type].description,
      parameters: {
        type: 'object',
        properties: schemaProperties[type],
        additionalProperties: false,
      },
    },
  })),
]
