import { sql } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import { createDb } from './client';
import {
  aiAgentRuns,
  conversations,
  handoffs,
  knowledgeArticles,
  messages,
  ticketDrafts,
  ticketEvents,
  tickets,
  users,
} from './schema';
import {
  DEMO_PASSWORD,
  SEED_ARTICLES,
  SEED_OFFSETS,
  SEED_TICKETS,
  SEED_USERS,
  userByKey,
  type UserKey,
} from './seed-data';
import { hashPassword } from '@/lib/auth/password';
import { computeDeadline, timeInSaoPaulo } from '@/lib/rules/deadline';
import type { TurnDecision } from '@/lib/contracts/decision';
import type { MessagePart } from '@/lib/contracts/parts';
import type { DraftPayload } from '@/lib/contracts/drafts';

export type SeedResult = {
  users: Record<UserKey, { id: string; email: string }>;
  conversations: Partial<Record<UserKey, string>>;
};

const { H, D } = SEED_OFFSETS;
const MIN = 60_000;

const TICKET_HISTORY: Record<
  string,
  Array<{ kind: 'comment' | 'status_changed'; body: string; actor: string; ago: number }>
> = {
  'INC-20298': [
    {
      kind: 'comment',
      body: 'Verificando a permissão com o dono da pasta Financeiro.',
      actor: 'Juliana Costa',
      ago: 2 * H,
    },
    { kind: 'status_changed', body: 'Em andamento', actor: 'Juliana Costa', ago: 1 * H },
  ],
  'INC-20311': [
    {
      kind: 'comment',
      body: 'Pedi o log de desempenho; aguardando retorno da funcionária.',
      actor: 'Rafael Lima',
      ago: 6 * D,
    },
  ],
  'REQ-10442': [
    { kind: 'status_changed', body: 'Aprovado pelo gestor', actor: 'Rafael Lima', ago: 3 * D },
    {
      kind: 'comment',
      body: 'Monitor separado no estoque; entrega na próxima remessa.',
      actor: 'Juliana Costa',
      ago: 2 * D,
    },
  ],
  'INC-20150': [
    { kind: 'comment', body: 'Senha desbloqueada no SAP.', actor: 'Rafael Lima', ago: 4 * D + H },
    { kind: 'status_changed', body: 'Resolvido', actor: 'Juliana Costa', ago: 4 * D },
  ],
};

const APP_TABLES = [
  'api_audit_log',
  'event_log',
  'idempotency_keys',
  'llm_calls',
  'handoffs',
  'ticket_drafts',
  'ai_agent_runs',
  'messages',
  'conversations',
  'employee_sessions',
  'knowledge_articles',
  'users',
];

type Msg = {
  at: number;
  direction: 'inbound' | 'outbound';
  sent_via: 'user' | 'ai' | 'system';
  type?: 'text' | 'system';
  body: string;
  parts?: MessagePart[];
  run?: boolean;
};

type ConvSeed = {
  key: UserKey;
  status: 'ai_handling' | 'pending' | 'closed';
  closed_reason?: 'resolved';
  unread?: number;
  focus?: string;
  msgs: Msg[];
  handoff?: {
    reason: 'requested_human' | 'low_confidence';
    origin: 'explicit_request' | 'trigger';
    level: 'N1' | 'N2';
    priority: 'high' | 'medium';
    ticket_code?: string;
    employee_words: string;
    agent_reading: string;
    confidence?: number;
  };
  decision?: TurnDecision;
};

function seedConversations(now: number): ConvSeed[] {
  return [
    {
      key: 'carla',
      status: 'pending',
      unread: 1,
      focus: 'INC-20388',
      msgs: [
        {
          at: now - 12 * MIN,
          direction: 'inbound',
          sent_via: 'user',
          body: 'Quero falar com um analista, por favor.',
        },
        {
          at: now - 12 * MIN + 2000,
          direction: 'outbound',
          sent_via: 'system',
          type: 'system',
          body: `Transferida para Suporte N1 · ${timeInSaoPaulo(new Date(now - 12 * MIN))}`,
          parts: [{ kind: 'handoff_notice', reason_code: 'requested_human', level: 'N1' }],
        },
        {
          at: now - 5 * MIN,
          direction: 'inbound',
          sent_via: 'user',
          body: 'Preciso de acesso ao SAP ainda hoje',
        },
      ],
      handoff: {
        reason: 'requested_human',
        origin: 'explicit_request',
        level: 'N1',
        priority: 'high',
        ticket_code: 'INC-20388',
        employee_words: 'Quero falar com um analista, por favor.',
        agent_reading: 'A funcionária pediu atendimento humano antes de descrever o problema.',
      },
    },
    {
      key: 'bruno',
      status: 'pending',
      msgs: [
        {
          at: now - 40 * MIN,
          direction: 'inbound',
          sent_via: 'user',
          body: 'O sistema de estoque mostra um aviso estranho quando eu fecho o lote, não sei se é problema meu',
        },
        {
          at: now - 39 * MIN,
          direction: 'outbound',
          sent_via: 'ai',
          body: 'Vou chamar um analista para isso.',
          run: true,
        },
        {
          at: now - 39 * MIN + 2000,
          direction: 'outbound',
          sent_via: 'system',
          type: 'system',
          body: `Transferida para Suporte N1 · ${timeInSaoPaulo(new Date(now - 39 * MIN))}`,
          parts: [{ kind: 'handoff_notice', reason_code: 'low_confidence', level: 'N1' }],
        },
      ],
      handoff: {
        reason: 'low_confidence',
        origin: 'trigger',
        level: 'N1',
        priority: 'medium',
        employee_words:
          'O sistema de estoque mostra um aviso estranho quando eu fecho o lote, não sei se é problema meu',
        agent_reading:
          'Aviso no fechamento de lote do sistema de estoque; não há artigo nem chamado relacionado.',
        confidence: 0.41,
      },
      decision: {
        understanding: {
          intent: 'other',
          summary: 'Aviso desconhecido ao fechar lote no sistema de estoque',
          evidence: 'mostra um aviso estranho quando eu fecho o lote',
        },
        decision: {
          action: 'transfer',
          confidence: 0.41,
          why: 'Não encontrei artigo nem chamado sobre esse aviso e não sei se é erro do sistema.',
          rules_applied: ['Baixa confiança: 41% está abaixo do limiar de 60%'],
          sources: [],
        },
      },
    },
    {
      key: 'diego',
      status: 'ai_handling',
      msgs: [
        { at: now - 3 * H, direction: 'inbound', sent_via: 'user', body: 'Como instalo o Figma?' },
        {
          at: now - 3 * H + 5000,
          direction: 'outbound',
          sent_via: 'ai',
          body: 'O Figma está no portal de softwares: é só instalar por lá, sem precisar de chamado.',
        },
      ],
    },
    {
      key: 'elisa',
      status: 'ai_handling',
      focus: 'INC-20519',
      msgs: [
        {
          at: now - 2 * H - 2 * MIN,
          direction: 'inbound',
          sent_via: 'user',
          body: 'Pode confirmar o chamado do teclado.',
        },
        { at: now - 2 * H, direction: 'outbound', sent_via: 'ai', body: 'Chamado INC-20519 criado.' },
      ],
    },
    {
      key: 'ana',
      status: 'closed',
      closed_reason: 'resolved',
      focus: 'INC-19877',
      msgs: [
        {
          at: now - 3 * D - 10 * MIN,
          direction: 'inbound',
          sent_via: 'user',
          body: 'O Outlook do celular parou de sincronizar.',
        },
        {
          at: now - 3 * D - 9 * MIN,
          direction: 'outbound',
          sent_via: 'ai',
          body: 'Remova e adicione novamente sua conta corporativa no Outlook.',
        },
        {
          at: now - 3 * D - 5 * MIN,
          direction: 'inbound',
          sent_via: 'user',
          body: 'Funcionou, obrigado!',
        },
        {
          at: now - 3 * D,
          direction: 'outbound',
          sent_via: 'system',
          type: 'system',
          body: `Atendimento resolvido · ${timeInSaoPaulo(new Date(now - 3 * D))}`,
        },
      ],
    },
    {
      key: 'fabio',
      status: 'closed',
      closed_reason: 'resolved',
      msgs: [
        { at: now - 5 * H, direction: 'inbound', sent_via: 'user', body: 'A impressora não imprime nada' },
        {
          at: now - 5 * H + 4000,
          direction: 'outbound',
          sent_via: 'ai',
          body: 'Cancele os documentos da fila em Configurações > Impressoras e reinicie o computador.',
        },
        { at: now - 4 * H, direction: 'inbound', sent_via: 'user', body: 'Isso resolveu, obrigado!' },
      ],
    },
    {
      key: 'gabriela',
      status: 'closed',
      closed_reason: 'resolved',
      msgs: [
        {
          at: now - D - 2 * H,
          direction: 'inbound',
          sent_via: 'user',
          body: 'Qual a senha do Wi-Fi de visitantes?',
        },
        {
          at: now - D - 2 * H + 4000,
          direction: 'outbound',
          sent_via: 'ai',
          body: 'A senha do Wi-Fi foi enviada para o seu e-mail e também fica no mural da recepção.',
        },
      ],
    },
  ];
}

/** Um hash (com salt próprio) por usuário, calculado uma vez por processo: o seed roda antes de cada teste. */
const seedHashes = new Map<UserKey, Promise<string>>();
export function seedPasswordHash(key: UserKey): Promise<string> {
  let h = seedHashes.get(key);
  if (!h) {
    h = hashPassword(DEMO_PASSWORD);
    seedHashes.set(key, h);
  }
  return h;
}

function previewOf(m: Msg): string {
  return m.sent_via === 'ai' ? `Nexo: ${m.body}` : m.body;
}

/** Trunca tudo e recria os dados de exemplo relativos a `agora`. */
export async function resetAndSeed(url: string, now: Date = new Date()): Promise<SeedResult> {
  const db = createDb(url, { max: 1 });
  const t0 = now.getTime();
  const hashes = await Promise.all(SEED_USERS.map((u) => seedPasswordHash(u.key)));
  try {
    await db.transaction(async (tx) => {
      const mastra = await tx.execute<{ table_name: string }>(
        sql`select table_name from information_schema.tables where table_schema = 'mastra' and table_type = 'BASE TABLE'`,
      );
      const extras = mastra.map((r) => `mastra."${r.table_name}"`);
      const list = [
        ...APP_TABLES.map((t) => `public."${t}"`),
        'tickets.ticket_events',
        'tickets.idempotency_keys',
        'tickets.tickets',
        ...extras,
      ].join(', ');
      await tx.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
      // INC-20519 existe no seed: os novos começam depois dele.
      await tx.execute(sql`select setval('tickets.inc_seq', 20520, false)`);
      await tx.execute(sql`select setval('tickets.req_seq', 10500, false)`);
      await tx.execute(sql`select setval('public.draft_seq', 381, false)`);

      await tx.insert(users).values(
        SEED_USERS.map((u, i) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          department: u.department,
          support_level: u.support_level,
          password_hash: hashes[i],
        })),
      );

      await tx.insert(knowledgeArticles).values(SEED_ARTICLES);

      for (const st of SEED_TICKETS) {
        const last = new Date(t0 - st.last_update_ago);
        const [row] = await tx
          .insert(tickets)
          .values({
            code: st.code,
            type: st.type,
            title: st.title,
            description: st.description,
            category: st.category,
            subcategory: st.subcategory,
            priority: st.priority,
            affected: st.affected,
            status: st.status,
            requester_id: userByKey(st.owner).id,
            assignee_name: st.assignee_name,
            due_at: computeDeadline(st.priority, last).due_at,
            last_update_at: last,
            resolved_at: st.resolved_ago === null ? null : new Date(t0 - st.resolved_ago),
            created_at: new Date(t0 - st.created_ago),
          })
          .returning({ id: tickets.id });
        await tx.insert(ticketEvents).values({
          ticket_id: row!.id,
          kind: 'created',
          body: 'Chamado aberto',
          actor: userByKey(st.owner).name,
          created_at: new Date(t0 - st.created_ago),
        });
        for (const event of TICKET_HISTORY[st.code] ?? []) {
          await tx.insert(ticketEvents).values({
            ticket_id: row!.id,
            kind: event.kind,
            body: event.body,
            actor: event.actor,
            created_at: new Date(t0 - event.ago),
          });
        }
      }
    });

    const convIds: Partial<Record<UserKey, string>> = {};
    for (const c of seedConversations(t0)) {
      const employee = userByKey(c.key);
      const last = c.msgs[c.msgs.length - 1]!;
      const lastVisible = [...c.msgs].reverse().find((m) => m.sent_via !== 'system') ?? last;
      const [conv] = await db
        .insert(conversations)
        .values({
          employee_id: employee.id,
          status: c.status,
          closed_reason: c.closed_reason ?? null,
          closed_at: c.status === 'closed' ? new Date(last.at) : null,
          status_changed_at: new Date(last.at),
          focus_ticket_code: c.focus ?? null,
          last_message_at: new Date(last.at),
          last_message_preview: previewOf(lastVisible),
          unread_count_for_assignee: c.unread ?? 0,
          last_handoff_at: c.handoff ? new Date(c.msgs[1]!.at) : null,
          last_handoff_reason: c.handoff?.reason ?? null,
          created_at: new Date(c.msgs[0]!.at),
          updated_at: new Date(last.at),
        })
        .returning({ id: conversations.id });
      const conversation_id = conv!.id;
      convIds[c.key] = conversation_id;

      let seededElisaDraft: { id: string; code: string; payload: DraftPayload } | null = null;
      if (c.key === 'elisa') {
        const payload: DraftPayload = {
          title: 'Teclado do notebook com teclas falhando',
          description: 'As teclas A, S e D do notebook falham com frequência.',
          type: 'incident',
          category: 'hardware',
          affected: 'me',
          blocks_work: false,
          deadline_today: false,
          priority: 'medium',
          priority_rule: 'Prioridade média: impacto individual sem compromisso imediato.',
          due_at: computeDeadline('medium', new Date(t0 - 2 * H)).due_at.toISOString(),
        };
        const [draft] = await db
          .insert(ticketDrafts)
          .values({
            code: 'D-SEED-INC-20519',
            conversation_id,
            kind: 'create',
            target_ticket_code: null,
            payload,
            status: 'confirmed',
            result_ticket_code: 'INC-20519',
            created_at: new Date(t0 - 2 * H),
            decided_at: new Date(t0 - 2 * H),
          })
          .returning({ id: ticketDrafts.id, code: ticketDrafts.code });
        seededElisaDraft = { id: draft!.id, code: draft!.code, payload };
      }

      let handoffId: string | null = null;
      if (c.handoff) {
        const h = c.handoff;
        const at = new Date(c.msgs[1]!.at);
        const [hrow] = await db
          .insert(handoffs)
          .values({
            conversation_id,
            ticket_code: h.ticket_code ?? null,
            origin: h.origin,
            reason_code: h.reason,
            support_level: h.level,
            title: h.reason === 'requested_human' ? 'Pediu para falar com um analista' : 'Agent pediu ajuda',
            body: `Palavras do funcionário: "${h.employee_words}"\nSegundo o agent — confira: ${h.agent_reading}`,
            employee_words: h.employee_words,
            agent_reading: h.agent_reading,
            attempts: [],
            confidence: h.confidence ?? null,
            due_at: computeDeadline(h.priority, at).due_at,
            created_at: at,
          })
          .returning({ id: handoffs.id });
        handoffId = hrow!.id;
      }

      for (const m of c.msgs) {
        let agent_run_id: string | null = null;
        if (m.run) {
          const [run] = await db
            .insert(aiAgentRuns)
            .values({
              conversation_id,
              status: c.handoff ? 'handoff' : 'completed',
              model: 'deepseek-chat',
              tokens_in: 1830,
              tokens_out: 96,
              cost_cents: null,
              latency_ms: 2140,
              steps_count: 2,
              tool_calls: [
                {
                  id: 'seed-1',
                  label: 'buscou na central de ajuda',
                  tool: 'search_articles',
                  result: 'ok',
                  duration_ms: 12,
                  summary: 'nenhum artigo relacionado',
                },
              ],
              decision: c.decision ?? null,
              started_at: new Date(m.at - 2140),
              completed_at: new Date(m.at),
            })
            .returning({ id: aiAgentRuns.id });
          agent_run_id = run!.id;
        }
        const draftCard: MessagePart[] =
          seededElisaDraft && m.sent_via === 'ai' && m.body.includes('INC-20519')
            ? [
                {
                  kind: 'draft_card',
                  draft_id: seededElisaDraft.id,
                  code: seededElisaDraft.code,
                  draft_kind: 'create',
                  target_code: null,
                  status: 'confirmed',
                  payload: seededElisaDraft.payload,
                  result_ticket_code: 'INC-20519',
                },
              ]
            : [];
        await db.insert(messages).values({
          conversation_id,
          direction: m.direction,
          type: m.type ?? 'text',
          sent_via: m.sent_via,
          sent_by_user_id: m.sent_via === 'user' && m.direction === 'inbound' ? employee.id : null,
          body: m.body,
          parts: m.parts ?? draftCard,
          agent_run_id,
          metadata: m.type === 'system' && handoffId ? { handoff_id: handoffId } : {},
          created_at: new Date(m.at),
        });
      }
    }

    const usersOut = Object.fromEntries(
      SEED_USERS.map((u) => [u.key, { id: u.id, email: u.email }]),
    ) as SeedResult['users'];
    return { users: usersOut, conversations: convIds };
  } finally {
    await db.$client.end({ timeout: 1 });
  }
}

// Só como CLI (`pnpm db:seed`). Empacotado no bootstrap do container, import.meta.url é o do bundle e o
// seed rodaria a cada start apagando o histórico — por isso o nome do arquivo também é conferido.
if (
  process.argv[1] &&
  /seed\.[cm]?[tj]s$/.test(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await import('dotenv/config');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const r = await resetAndSeed(url);
  console.log(
    `seed applied: ${Object.keys(r.users).length} users, ${Object.keys(r.conversations).length} conversations`,
  );
}
