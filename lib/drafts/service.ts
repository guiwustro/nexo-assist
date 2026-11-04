import { and, eq, isNull, sql } from 'drizzle-orm';
import { Conflict, NotFound, Unprocessable } from '@/lib/api/errors';
import { getDb, type DbOrTx } from '@/lib/db/client';
import { conversations, messages, ticketDrafts } from '@/lib/db/schema';
import { emitEvent } from '@/lib/event-log/emit';
import { serverNow } from '@/lib/env';
import type { Session } from '@/lib/auth/session';
import { PRIORITY_LABEL } from '@/lib/contracts/enums';
import type { DraftEdit, DraftKind, DraftPayload, DraftStatus } from '@/lib/contracts/drafts';
import type { MessagePart } from '@/lib/contracts/parts';
import type { Ticket } from '@/lib/contracts/tickets';
import { getTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { TicketsRejectedError } from '@/lib/agent-engine/edge/tickets/errors';
import { noteToMemory } from '@/lib/agent-engine/agent/memory';
import { appendMessage } from '@/lib/conversations/service';
import { computeDeadline, formatShortDeadline } from '@/lib/rules/deadline';
import { computePriority } from '@/lib/rules/priority';
import { describeOverdue } from '@/lib/rules/overdue';

export type Draft = typeof ticketDrafts.$inferSelect;

export async function createDraft(
  i: { conversation_id: string; agent_run_id: string | null; kind: DraftKind; target_ticket_code: string | null; payload: DraftPayload },
  db: DbOrTx = getDb(),
): Promise<Draft> {
  const [n] = await db.execute<{ n: string }>(sql`select nextval('public.draft_seq')::text as n`);
  const [row] = await db
    .insert(ticketDrafts)
    .values({
      code: `D-${n!.n}`,
      conversation_id: i.conversation_id,
      agent_run_id: i.agent_run_id,
      kind: i.kind,
      target_ticket_code: i.target_ticket_code,
      payload: i.payload,
      status: 'pending',
    })
    .returning();
  await emitEvent(db, {
    type: 'draft.created',
    conversation_id: i.conversation_id,
    payload: { draft_id: row!.id, code: row!.code, kind: i.kind },
  });
  return row!;
}

export async function getDraft(id: string, db: DbOrTx = getDb()): Promise<Draft | null> {
  const [d] = await db.select().from(ticketDrafts).where(eq(ticketDrafts.id, id));
  return d ?? null;
}

/** Rascunho do dono da sessão (de outra pessoa = 404, igual a inexistente). */
async function ownedDraft(id: string, session: Session): Promise<Draft & { employee_id: string }> {
  const [row] = await getDb()
    .select({ d: ticketDrafts, employee_id: conversations.employee_id })
    .from(ticketDrafts)
    .innerJoin(conversations, eq(conversations.id, ticketDrafts.conversation_id))
    .where(eq(ticketDrafts.id, id));
  if (!row || row.employee_id !== session.user_id) throw new NotFound('draft_not_found', 'Rascunho não encontrado');
  return { ...row.d, employee_id: row.employee_id };
}

/** Mantém o card do rascunho na mensagem do agent igual ao estado atual (histórico fiel ao recarregar). */
async function syncDraftCard(db: DbOrTx, d: Draft): Promise<void> {
  const rows = await db
    .select({ id: messages.id, parts: messages.parts })
    .from(messages)
    .where(
      and(
        eq(messages.conversation_id, d.conversation_id),
        sql`${messages.parts} @> ${JSON.stringify([{ kind: 'draft_card', draft_id: d.id }])}::jsonb`,
      ),
    );
  for (const r of rows) {
    const parts = r.parts.map((p): MessagePart =>
      p.kind === 'draft_card' && p.draft_id === d.id
        ? { ...p, status: d.status as DraftStatus, payload: d.payload, result_ticket_code: d.result_ticket_code ?? null }
        : p,
    );
    await db.update(messages).set({ parts }).where(eq(messages.id, r.id));
  }
}

const JA_ENVIADO = () =>
  new Conflict(
    'draft_already_sent',
    'Este rascunho já foi enviado ao sistema de chamados e não pode mais ser editado. Confirme de novo para ver o resultado, ou cancele.',
  );

export async function editDraft(id: string, session: Session, edit: DraftEdit): Promise<Draft> {
  const d = await ownedDraft(id, session);
  if (d.status !== 'pending') throw new Conflict('draft_not_pending', 'Este rascunho não pode mais ser editado');
  // A chave de idempotência já foi usada com este conteúdo: mudar agora faria o legado recusar (ou duplicar).
  if (d.sent_at) throw JA_ENVIADO();
  const merged = { ...d.payload, ...Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== undefined)) };
  const prioridade = computePriority(merged);
  const payload: DraftPayload = {
    ...merged,
    priority: prioridade.priority,
    priority_rule: prioridade.rule,
    due_at: computeDeadline(prioridade.priority, serverNow()).due_at.toISOString(),
  };
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(ticketDrafts)
      .set({ payload })
      .where(and(eq(ticketDrafts.id, id), eq(ticketDrafts.status, 'pending'), isNull(ticketDrafts.sent_at)))
      .returning();
    if (!row) {
      const atual = await getDraft(id, tx);
      throw atual?.status === 'pending' ? JA_ENVIADO() : new Conflict('draft_not_pending', 'Este rascunho não pode mais ser editado');
    }
    await syncDraftCard(tx, row);
    return row;
  });
}

export async function cancelDraft(id: string, session: Session): Promise<Draft> {
  const d = await ownedDraft(id, session);
  if (d.status === 'cancelled') return d;
  if (d.status !== 'pending') throw new Conflict('draft_not_pending', 'Este rascunho não pode mais ser cancelado');
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(ticketDrafts)
      .set({ status: 'cancelled', decided_at: new Date() })
      .where(and(eq(ticketDrafts.id, id), eq(ticketDrafts.status, 'pending')))
      .returning();
    if (!row) throw new Conflict('draft_not_pending', 'Este rascunho não pode mais ser cancelado');
    await syncDraftCard(tx, row);
    await appendMessage(tx, {
      conversation_id: row.conversation_id,
      direction: 'outbound',
      type: 'system',
      sent_via: 'system',
      body: `Rascunho ${row.code} cancelado`,
    });
    return row;
  });
}

const VERBO: Record<DraftKind, string> = { create: 'criado', update: 'atualizado', reopen: 'reaberto' };

/**
 * Cria/atualiza/reabre no serviço de chamados com a chave de idempotência do rascunho: clique duplo, retry e
 * duas abas dão o mesmo chamado. Sistema fora → erro transitório (503) e o rascunho continua pendente.
 */
export async function confirmDraft(id: string, session: Session): Promise<{ draft: Draft; ticket: Ticket }> {
  const d = await ownedDraft(id, session);
  if (d.status === 'cancelled') throw new Conflict('draft_cancelled', 'Este rascunho foi cancelado');
  if (d.status === 'failed') throw new Conflict('draft_failed', 'Este rascunho não pôde ser enviado', { error_code: d.error_code });

  const tickets = getTicketsClient();
  const key = d.idempotency_key;
  // Marca o envio antes de chamar o legado e confirma com o conteúdo gravado nesse momento: uma edição
  // concorrente ou posterior não pode mudar o que vai com esta chave.
  const [enviado] = await getDb()
    .update(ticketDrafts)
    .set({ sent_at: sql`coalesce(${ticketDrafts.sent_at}, now())` })
    .where(and(eq(ticketDrafts.id, id), eq(ticketDrafts.status, 'pending')))
    .returning();
  const p = (enviado ?? d).payload;
  let ticket: Ticket;
  try {
    if (d.kind === 'create') {
      ticket = await tickets.create(
        {
          requester_id: session.user_id,
          type: p.type,
          title: p.title,
          description: p.description,
          category: p.category,
          priority: p.priority,
          affected: p.affected,
        },
        key,
      );
    } else if (d.kind === 'update') {
      ticket = await tickets.update(
        d.target_ticket_code!,
        { requester_id: session.user_id, comment: p.comment ?? p.description },
        key,
      );
    } else {
      ticket = await tickets.reopen(d.target_ticket_code!, session.user_id, key, p.comment ?? p.description);
    }
  } catch (e) {
    if (e instanceof TicketsRejectedError) {
      const [failed] = await getDb()
        .update(ticketDrafts)
        .set({ status: 'failed', error_code: e.code, decided_at: new Date() })
        .where(and(eq(ticketDrafts.id, id), eq(ticketDrafts.status, 'pending')))
        .returning();
      if (failed) await syncDraftCard(getDb(), failed);
      throw new Unprocessable(e.code, e.message);
    }
    throw e;
  }

  const now = serverNow();
  const venceu = await getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(ticketDrafts)
      .set({ status: 'confirmed', result_ticket_code: ticket.code, decided_at: new Date() })
      .where(and(eq(ticketDrafts.id, id), eq(ticketDrafts.status, 'pending')))
      .returning();
    if (!row) return null;
    await syncDraftCard(tx, row);
    const atraso = describeOverdue(ticket, now);
    await appendMessage(tx, {
      conversation_id: row.conversation_id,
      direction: 'outbound',
      type: 'system',
      sent_via: 'system',
      body: `${ticket.code} ${VERBO[d.kind as DraftKind]} · prioridade ${PRIORITY_LABEL[ticket.priority]} · ${formatShortDeadline(new Date(ticket.due_at), now)}`,
      parts: [{ kind: 'ticket_card', ticket, overdue: atraso !== null, ...(atraso ? { overdue_label: atraso } : {}) }],
      metadata: { draft_id: row.id },
    });
    await tx.update(conversations).set({ focus_ticket_code: ticket.code }).where(eq(conversations.id, row.conversation_id));
    await emitEvent(tx, {
      type: 'draft.confirmed',
      conversation_id: row.conversation_id,
      actor_user_id: session.user_id,
      payload: { draft_id: row.id, ticket_code: ticket.code },
    });
    await emitEvent(tx, {
      type: d.kind === 'create' ? 'ticket.created' : 'ticket.updated',
      conversation_id: row.conversation_id,
      actor_user_id: session.user_id,
      payload: { ticket_code: ticket.code },
    });
    return row;
  });

  if (venceu) {
    noteToMemory(
      venceu.conversation_id,
      session.user_id,
      `Funcionário confirmou o rascunho ${venceu.code} → ${ticket.code} (${VERBO[d.kind as DraftKind]}, prioridade ${PRIORITY_LABEL[ticket.priority]}).`,
    ).catch((e: unknown) => console.warn('[drafts] nota na memória falhou', e));
    return { draft: venceu, ticket };
  }
  const atual = await getDraft(id);
  return { draft: atual!, ticket };
}

export function toApiDraft(d: Draft) {
  return {
    id: d.id,
    code: d.code,
    kind: d.kind,
    target_ticket_code: d.target_ticket_code,
    status: d.status,
    payload: d.payload,
    result_ticket_code: d.result_ticket_code,
    error_code: d.error_code,
  };
}
