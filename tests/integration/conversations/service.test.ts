import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { useTestDb } from '@/tests/helpers/db';
import { conversations, employeeSessions, eventLog, handoffs, messages } from '@/lib/db/schema';
import { getOrCreateWithAgent, touchSession } from '@/lib/conversations/attendance';
import { applyTransition, registerEmployeeMessage } from '@/lib/conversations/service';
import { createHandoff } from '@/lib/conversations/handoff';
import { countsForAnalyst, listForAnalyst, listMessages } from '@/lib/conversations/queries';
import { AppError } from '@/lib/api/errors';

const t = useTestDb();
const rafael = () => ({ user_id: t.seed.users.rafael.id, role: 'analyst' as const });
const juliana = () => ({ user_id: t.seed.users.juliana.id, role: 'analyst' as const });

async function errorOf(p: Promise<unknown>): Promise<AppError> {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  if (!(e instanceof AppError)) throw new Error(`esperava AppError, veio ${String(e)}`);
  return e;
}

async function events(conversationId: string, type: string) {
  return t.db
    .select()
    .from(eventLog)
    .where(and(eq(eventLog.conversation_id, conversationId), eq(eventLog.event_type, type)));
}

async function sessionCount(employeeId: string) {
  const [session] = await t.db
    .select()
    .from(employeeSessions)
    .where(eq(employeeSessions.employee_id, employeeId));
  return session?.message_count ?? 0;
}

async function agentAttendance(employeeId: string, sid: string, loginAt: Date = t.now) {
  await touchSession(employeeId, sid, loginAt);
  return (await getOrCreateWithAgent(employeeId, t.now)).conversation;
}

describe('sessão do funcionário', () => {
  it('mesmo sid → mesmo atendimento e contador preservado; login mais novo zera', async () => {
    const ana = t.seed.users.ana.id;
    const loginA = t.now;
    const c1 = await agentAttendance(ana, 'sid-a', loginA);
    await registerEmployeeMessage(c1.id, 'oi', 30);
    const c2 = await agentAttendance(ana, 'sid-a', loginA);
    expect(c2.id).toBe(c1.id);
    expect(await sessionCount(ana)).toBe(1);
    const c3 = await agentAttendance(ana, 'sid-b', new Date(loginA.getTime() + 1));
    expect(c3.id).toBe(c1.id);
    expect(await sessionCount(ana)).toBe(0);
  });

  it('dois aparelhos alternando não zeram o contador; só um login mais novo zera', async () => {
    const ana = t.seed.users.ana.id;
    const loginA = new Date(t.now.getTime() - 120_000);
    const loginB = new Date(t.now.getTime() - 60_000);
    const a1 = await agentAttendance(ana, 'sid-a', loginA);
    await registerEmployeeMessage(a1.id, 'oi do notebook', 30);
    const b1 = await agentAttendance(ana, 'sid-b', loginB);
    expect(await sessionCount(ana)).toBe(0);
    await registerEmployeeMessage(b1.id, 'oi do celular', 30);
    await registerEmployeeMessage(b1.id, 'de novo', 30);

    const a2 = await agentAttendance(ana, 'sid-a', loginA);
    expect(await sessionCount(ana)).toBe(2);
    await registerEmployeeMessage(a2.id, 'voltei ao notebook', 30);
    const b2 = await agentAttendance(ana, 'sid-b', loginB);
    expect(b2.id).toBe(a2.id);
    expect(await sessionCount(ana)).toBe(3);
  });
});

describe('registerEmployeeMessage', () => {
  it('a 30ª atinge o limite e a 31ª é recusada', async () => {
    const conv = await agentAttendance(t.seed.users.ana.id, 'sid-a');
    await t.db
      .update(employeeSessions)
      .set({ message_count: 29 })
      .where(eq(employeeSessions.employee_id, t.seed.users.ana.id));
    const r = await registerEmployeeMessage(conv.id, 'trigésima', 30);
    expect(r).toMatchObject({ count: 30, reached_limit: true });
    const e = await errorOf(registerEmployeeMessage(conv.id, 'trigésima primeira', 30));
    expect(e.code).toBe('session_limit_reached');
    expect(e.status).toBe(409);
  });

  it('com o analista, a mensagem passa do limite: o limite vale só para o agent', async () => {
    const carla = t.seed.conversations.carla!; // pendente, esperando um analista
    await t.db
      .insert(employeeSessions)
      .values({
        employee_id: t.seed.users.carla.id,
        session_id: 'sid-c',
        session_started_at: t.now,
        message_count: 30,
      });
    const r = await registerEmployeeMessage(carla, 'ainda estou aqui', 30);
    expect(r.message.body).toBe('ainda estou aqui');
    await applyTransition(carla, 'claim', rafael());
    const r2 = await registerEmployeeMessage(carla, 'oi, Rafael', 30);
    expect(r2.message.body).toBe('oi, Rafael');
  });

  it('grava a mensagem, atualiza o preview e emite evento', async () => {
    const conv = await agentAttendance(t.seed.users.ana.id, 'sid-a');
    const { message } = await registerEmployeeMessage(conv.id, 'VPN com erro 809', 30);
    expect(message).toMatchObject({ direction: 'inbound', sent_via: 'user', body: 'VPN com erro 809' });
    const [row] = await t.db.select().from(conversations).where(eq(conversations.id, conv.id));
    expect(row?.last_message_preview).toBe('VPN com erro 809');
    expect(await events(conv.id, 'conversation.message_created')).toHaveLength(1);
  });

  it('mensagem em conversa encerrada é recusada como transição inválida', async () => {
    const fabio = t.seed.conversations.fabio!;
    const error = await errorOf(registerEmployeeMessage(fabio, 'voltou a falhar', 30));
    expect(error.code).toBe('invalid_transition');
    const [row] = await t.db.select().from(conversations).where(eq(conversations.id, fabio));
    expect(row?.status).toBe('closed');
  });

  it('mensagem em conversa assumida incrementa as não lidas do analista', async () => {
    const carla = t.seed.conversations.carla!;
    await applyTransition(carla, 'claim', rafael());
    await registerEmployeeMessage(carla, 'oi?', 30);
    const [row] = await t.db.select().from(conversations).where(eq(conversations.id, carla));
    expect(row?.unread_count_for_assignee).toBe(1);
  });
});

describe('applyTransition', () => {
  it('dois analistas assumem ao mesmo tempo: só um vence', async () => {
    const carla = t.seed.conversations.carla!;
    const rs = await Promise.allSettled([
      applyTransition(carla, 'claim', rafael()),
      applyTransition(carla, 'claim', juliana()),
    ]);
    const ok = rs.filter((r) => r.status === 'fulfilled');
    const ko = rs.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect((ko[0]!.reason as AppError).code).toBe('conversation_already_claimed');
    const [row] = await t.db.select().from(conversations).where(eq(conversations.id, carla));
    const winner = (ok[0] as PromiseFulfilledResult<{ assigned_to_user_id: string | null }>).value
      .assigned_to_user_id;
    expect(row?.assigned_to_user_id).toBe(winner);
    expect(row?.status).toBe('claimed');
  });

  it('assumir grava mensagem de sistema com o nome e emite evento', async () => {
    const carla = t.seed.conversations.carla!;
    await applyTransition(carla, 'claim', rafael());
    const sys = await t.db
      .select()
      .from(messages)
      .where(and(eq(messages.conversation_id, carla), eq(messages.type, 'system')));
    expect(sys.some((m) => /^Rafael Lima assumiu · agent pausado · \d\d:\d\d$/.test(m.body))).toBe(true);
    expect(await events(carla, 'conversation.claimed')).toHaveLength(1);
  });

  it('devolver por quem não é o dono → Forbidden', async () => {
    const carla = t.seed.conversations.carla!;
    await applyTransition(carla, 'claim', rafael());
    const e = await errorOf(applyTransition(carla, 'release', juliana()));
    expect(e.status).toBe(403);
  });

  it('devolver e encerrar emitem seus eventos', async () => {
    const carla = t.seed.conversations.carla!;
    await applyTransition(carla, 'claim', rafael());
    const returned = await applyTransition(carla, 'release', rafael());
    expect(returned.status).toBe('ai_handling');
    expect(returned.assigned_to_user_id).toBeNull();
    expect(await events(carla, 'conversation.released')).toHaveLength(1);
    await applyTransition(carla, 'claim', rafael());
    const closed = await applyTransition(carla, 'close', rafael());
    expect(closed.status).toBe('closed');
    expect(await events(carla, 'conversation.closed')).toHaveLength(1);
  });

  it('transição inválida → invalid_transition', async () => {
    const diego = t.seed.conversations.diego!;
    const e = await errorOf(applyTransition(diego, 'release', rafael()));
    expect(e.code).toBe('invalid_transition');
  });
});

describe('createHandoff', () => {
  it('transfere com briefing literal e mensagem de sistema', async () => {
    const conv = await agentAttendance(t.seed.users.ana.id, 'sid-a');
    const h = await createHandoff(
      {
        conversation_id: conv.id,
        ticket_code: 'INC-20311',
        ticket_priority: 'medium',
        origin: 'explicit_request',
        reason_code: 'requested_human',
        level: 'N2',
        employee_words: 'quero falar com um analista',
        agent_reading: 'Notebook lento há 6 dias, chamado vencido',
        attempts: [],
      },
      t.now,
    );
    expect(h.body).toContain('"quero falar com um analista"');
    expect(h.body).toContain('Segundo o agent — confira');
    const [row] = await t.db.select().from(conversations).where(eq(conversations.id, conv.id));
    expect(row?.status).toBe('pending');
    expect(row?.focus_ticket_code).toBe('INC-20311');
    const sys = await t.db.select().from(messages).where(eq(messages.conversation_id, conv.id));
    expect(sys.some((m) => m.body.startsWith('Transferida para Suporte N2 · '))).toBe(true);
    expect(sys.some((m) => m.parts.some((p) => p.kind === 'handoff_notice'))).toBe(true);
    expect(await events(conv.id, 'conversation.transferred')).toHaveLength(1);
    expect(await t.db.$count(handoffs, eq(handoffs.conversation_id, conv.id))).toBe(1);
  });
});

describe('fila do analista', () => {
  it('contadores e filtros coerentes após uma transferência', async () => {
    const conv = await agentAttendance(t.seed.users.ana.id, 'sid-a');
    await createHandoff(
      {
        conversation_id: conv.id,
        origin: 'explicit_request',
        reason_code: 'requested_human',
        level: 'N1',
        employee_words: 'quero falar com um analista',
        agent_reading: '—',
        attempts: [],
      },
      t.now,
    );
    const counts = await countsForAnalyst(t.seed.users.rafael.id);
    expect(counts).toEqual({ all: 8, for_you: 3, with_agent: 2, mine: 0 });
    const forYou = await listForAnalyst(t.seed.users.rafael.id, { filter: 'for_you', now: t.now });
    expect(forYou.map((c) => c.employee.name)).toContain('Ana Souza');
    const bruno = forYou.find((c) => c.employee.name === 'Bruno Tavares');
    expect(bruno?.tag).toEqual({ kind: 'agent_asked_help', label: 'Agent pediu ajuda · confiança 41%' });
    const carla = forYou.find((c) => c.employee.name === 'Carla Mendes');
    expect(carla?.tag).toEqual({ kind: 'transferred', label: 'Transferida · INC-20388' });
    await applyTransition(conv.id, 'claim', rafael());
    expect((await countsForAnalyst(t.seed.users.rafael.id)).mine).toBe(1);
    const mine = await listForAnalyst(t.seed.users.rafael.id, { filter: 'mine' });
    expect(mine[0]?.tag).toEqual({ kind: 'with_me', label: 'Você está atendendo' });
  });

  it('busca por nome, preview e chamado em foco', async () => {
    expect(
      (await listForAnalyst(t.seed.users.rafael.id, { q: 'carla' })).map((c) => c.employee.name),
    ).toEqual(['Carla Mendes']);
    expect((await listForAnalyst(t.seed.users.rafael.id, { q: 'INC-20519' }))[0]?.employee.name).toBe(
      'Elisa Prado',
    );
    expect((await listForAnalyst(t.seed.users.rafael.id, { q: 'wi-fi' }))[0]?.employee.name).toBe(
      'Gabriela Rocha',
    );
  });

  describe('busca da fila', () => {
    const rafa = () => t.seed.users.rafael.id;
    const names = (l: Array<{ employee: { name: string } }>) => l.map((c) => c.employee.name);

    /** Conversa da Ana sobre VPN em que a última mensagem não fala de VPN. */
    async function anaTalkedAboutVpn() {
      const conv = await agentAttendance(t.seed.users.ana.id, 's');
      await registerEmployeeMessage(conv.id, 'Meu notebook não conecta na VPN, aparece o erro 809', 30);
      await registerEmployeeMessage(conv.id, 'Ok, vou tentar e te aviso', 30);
      return conv;
    }

    it('ignora acento: "fabio" acha Fábio Nunes, pelo nome', async () => {
      const r = await listForAnalyst(rafa(), { q: 'fabio' });
      expect(names(r)).toEqual(['Fábio Nunes']);
      expect(r[0]?.match).toEqual({ kind: 'name', text: 'Fábio Nunes' });
    });

    it('procura em todas as mensagens, não só na última, e mostra o trecho', async () => {
      await anaTalkedAboutVpn();
      for (const q of ['vpn', '809']) {
        const r = await listForAnalyst(rafa(), { q });
        expect(names(r), q).toEqual(['Ana Souza']);
        expect(r[0]?.match?.kind).toBe('message');
        expect(r[0]?.match?.text).toContain('VPN, aparece o erro 809');
      }
    });

    it('"ana" acha a Ana pelo nome e não quem só escreveu "analista"', async () => {
      await anaTalkedAboutVpn();
      expect(names(await listForAnalyst(rafa(), { q: 'ana' }))).toEqual(['Ana Souza', 'Ana Souza']);
      expect(names(await listForAnalyst(rafa(), { q: 'analis' }))).toEqual(['Carla Mendes', 'Bruno Tavares']);
    });

    it('chamados do funcionário (código e título) vindos do serviço de chamados', async () => {
      const carla = t.seed.users.carla.id;
      const byCode = await listForAnalyst(rafa(), {
        q: 'REQ-10460',
        ticketHits: [{ requester_id: carla, code: 'REQ-10460', title: 'Licença do Power BI' }],
      });
      expect(names(byCode)).toEqual(['Carla Mendes']);
      expect(byCode[0]?.match).toEqual({ kind: 'ticket', text: 'REQ-10460 · Licença do Power BI' });
      const byTitle = await listForAnalyst(rafa(), {
        q: 'diretoria',
        ticketHits: [{ requester_id: carla, code: 'INC-20388', title: 'Acesso à pasta da Diretoria' }],
      });
      expect(names(byTitle)).toEqual(['Carla Mendes']);
    });

    it('nome vem antes de conteúdo', async () => {
      const conv = await agentAttendance(t.seed.users.bruno.id, 's');
      await registerEmployeeMessage(conv.id, 'A Carla Mendes também está sem acesso', 30);
      expect(names(await listForAnalyst(rafa(), { q: 'carla' }))).toEqual(['Carla Mendes', 'Bruno Tavares']);
    });

    it('combina com os filtros', async () => {
      expect(names(await listForAnalyst(rafa(), { filter: 'for_you', q: 'carla' }))).toEqual([
        'Carla Mendes',
      ]);
      expect(await listForAnalyst(rafa(), { filter: 'with_agent', q: 'carla' })).toEqual([]);
      expect(names(await listForAnalyst(rafa(), { filter: 'with_agent', q: 'figma' }))).toEqual([
        'Diego Ramos',
      ]);
    });

    it('sem busca não há motivo', async () => {
      expect((await listForAnalyst(rafa()))[0]?.match).toBeNull();
    });
  });

  it('encerrada sem analista aparece como resolvida pelo agent', async () => {
    const all = await listForAnalyst(t.seed.users.rafael.id);
    expect(all.find((c) => c.employee.name === 'Fábio Nunes')?.tag.kind).toBe('resolved_by_agent');
    expect(all.find((c) => c.employee.name === 'Diego Ramos')?.tag).toEqual({
      kind: 'agent_handling',
      label: 'Agent atendendo',
    });
  });
});

describe('mensagem do 409 de assumir', () => {
  it('diz quem já assumiu', async () => {
    const carla = t.seed.conversations.carla!;
    await applyTransition(carla, 'claim', rafael());
    const e = await errorOf(applyTransition(carla, 'claim', juliana()));
    expect(e.message).toBe('Rafael Lima já assumiu esta conversa');
  });
});

describe('listMessages (paginação)', () => {
  it('página pelo cursor sem pular nem repetir, mesmo com mensagens no mesmo instante', async () => {
    const conv = await agentAttendance(t.seed.users.ana.id, 's');
    const base = new Date(t.now.getTime() - 3_600_000);
    // 120 mensagens em 40 instantes: 3 por instante, para o corte de página cair no meio de um empate.
    await t.db.insert(messages).values(
      Array.from({ length: 120 }, (_, i) => ({
        conversation_id: conv.id,
        direction: 'inbound' as const,
        sent_via: 'user' as const,
        body: `mensagem ${i}`,
        created_at: new Date(base.getTime() + Math.floor(i / 3) * 1000 + 0.4),
      })),
    );
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const r = await listMessages(conv.id, { limit: 50, cursor });
      seen.unshift(...r.messages.map((m) => m.id));
      if (!r.next_cursor) break;
      cursor = r.next_cursor;
    }
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
    const all = await listMessages(conv.id, { limit: 100 });
    expect(seen.slice(-100)).toEqual(all.messages.map((m) => m.id));
  });

  it('cursor inválido ou de outra conversa → página vazia, sem erro', async () => {
    const conv = await agentAttendance(t.seed.users.ana.id, 's');
    expect((await listMessages(conv.id, { cursor: 'lixo' })).messages).toEqual([]);
  });
});
