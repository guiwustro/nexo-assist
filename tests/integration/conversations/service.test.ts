import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { useTestDb } from '@/tests/helpers/db';
import { conversations, eventLog, handoffs, messages } from '@/lib/db/schema';
import {
  applyTransition,
  getOrCreateCurrent,
  registerEmployeeMessage,
} from '@/lib/conversations/service';
import { createHandoff } from '@/lib/conversations/handoff';
import { countsForAnalyst, listForAnalyst, listMessages } from '@/lib/conversations/queries';
import { AppError } from '@/lib/api/errors';

const t = useTestDb();
const rafael = () => ({ user_id: t.seed.users.rafael.id, role: 'analyst' as const });
const juliana = () => ({ user_id: t.seed.users.juliana.id, role: 'analyst' as const });

async function erroDe(p: Promise<unknown>): Promise<AppError> {
  const e = await p.then(() => null, (x: unknown) => x);
  if (!(e instanceof AppError)) throw new Error(`esperava AppError, veio ${String(e)}`);
  return e;
}

async function eventos(conversationId: string, tipo: string) {
  return t.db
    .select()
    .from(eventLog)
    .where(and(eq(eventLog.conversation_id, conversationId), eq(eventLog.event_type, tipo)));
}

describe('getOrCreateCurrent', () => {
  it('mesmo sid → mesma conversa e contador preservado; sid novo zera', async () => {
    const ana = t.seed.users.ana.id;
    const c1 = await getOrCreateCurrent(ana, 'sid-a');
    await registerEmployeeMessage(c1.id, 'oi', 30);
    const c2 = await getOrCreateCurrent(ana, 'sid-a');
    expect(c2.id).toBe(c1.id);
    expect(c2.session_message_count).toBe(1);
    const c3 = await getOrCreateCurrent(ana, 'sid-b');
    expect(c3.id).toBe(c1.id);
    expect(c3.session_message_count).toBe(0);
  });
});

describe('registerEmployeeMessage', () => {
  it('a 30ª atinge o limite e a 31ª é recusada', async () => {
    const conv = await getOrCreateCurrent(t.seed.users.ana.id, 'sid-a');
    await t.db.update(conversations).set({ session_message_count: 29 }).where(eq(conversations.id, conv.id));
    const r = await registerEmployeeMessage(conv.id, 'trigésima', 30);
    expect(r).toMatchObject({ count: 30, reached_limit: true });
    const e = await erroDe(registerEmployeeMessage(conv.id, 'trigésima primeira', 30));
    expect(e.code).toBe('session_limit_reached');
    expect(e.status).toBe(409);
  });

  it('com o analista, a mensagem passa do limite: o limite vale só para o agent', async () => {
    const carla = t.seed.conversations.carla!; // pendente, esperando um analista
    await t.db.update(conversations).set({ session_message_count: 30 }).where(eq(conversations.id, carla));
    const r = await registerEmployeeMessage(carla, 'ainda estou aqui', 30);
    expect(r.message.body).toBe('ainda estou aqui');
    await applyTransition(carla, 'claim', rafael());
    const r2 = await registerEmployeeMessage(carla, 'oi, Rafael', 30);
    expect(r2.message.body).toBe('oi, Rafael');
  });

  it('grava a mensagem, atualiza o preview e emite evento', async () => {
    const conv = await getOrCreateCurrent(t.seed.users.ana.id, 'sid-a');
    const { message } = await registerEmployeeMessage(conv.id, 'VPN com erro 809', 30);
    expect(message).toMatchObject({ direction: 'inbound', sent_via: 'user', body: 'VPN com erro 809' });
    const [row] = await t.db.select().from(conversations).where(eq(conversations.id, conv.id));
    expect(row?.last_message_preview).toBe('VPN com erro 809');
    expect(await eventos(conv.id, 'conversation.message_created')).toHaveLength(1);
  });

  it('conversa encerrada volta para o agent quando o funcionário escreve', async () => {
    const fabio = t.seed.conversations.fabio!;
    await registerEmployeeMessage(fabio, 'voltou a falhar', 30);
    const [row] = await t.db.select().from(conversations).where(eq(conversations.id, fabio));
    expect(row?.status).toBe('ai_handling');
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
    const rs = await Promise.allSettled([applyTransition(carla, 'claim', rafael()), applyTransition(carla, 'claim', juliana())]);
    const ok = rs.filter((r) => r.status === 'fulfilled');
    const ko = rs.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect((ko[0]!.reason as AppError).code).toBe('conversation_already_claimed');
    const [row] = await t.db.select().from(conversations).where(eq(conversations.id, carla));
    const vencedor = (ok[0] as PromiseFulfilledResult<{ assigned_to_user_id: string | null }>).value.assigned_to_user_id;
    expect(row?.assigned_to_user_id).toBe(vencedor);
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
    expect(await eventos(carla, 'conversation.claimed')).toHaveLength(1);
  });

  it('devolver por quem não é o dono → Forbidden', async () => {
    const carla = t.seed.conversations.carla!;
    await applyTransition(carla, 'claim', rafael());
    const e = await erroDe(applyTransition(carla, 'release', juliana()));
    expect(e.status).toBe(403);
  });

  it('devolver e encerrar emitem seus eventos', async () => {
    const carla = t.seed.conversations.carla!;
    await applyTransition(carla, 'claim', rafael());
    const devolvida = await applyTransition(carla, 'release', rafael());
    expect(devolvida.status).toBe('ai_handling');
    expect(devolvida.assigned_to_user_id).toBeNull();
    expect(await eventos(carla, 'conversation.released')).toHaveLength(1);
    await applyTransition(carla, 'claim', rafael());
    const fechada = await applyTransition(carla, 'close', rafael());
    expect(fechada.status).toBe('closed');
    expect(await eventos(carla, 'conversation.closed')).toHaveLength(1);
  });

  it('transição inválida → invalid_transition', async () => {
    const diego = t.seed.conversations.diego!;
    const e = await erroDe(applyTransition(diego, 'release', rafael()));
    expect(e.code).toBe('invalid_transition');
  });
});

describe('createHandoff', () => {
  it('transfere com briefing literal e mensagem de sistema', async () => {
    const conv = await getOrCreateCurrent(t.seed.users.ana.id, 'sid-a');
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
      t.agora,
    );
    expect(h.body).toContain('"quero falar com um analista"');
    expect(h.body).toContain('Segundo o agent — confira');
    const [row] = await t.db.select().from(conversations).where(eq(conversations.id, conv.id));
    expect(row?.status).toBe('pending');
    expect(row?.focus_ticket_code).toBe('INC-20311');
    const sys = await t.db.select().from(messages).where(eq(messages.conversation_id, conv.id));
    expect(sys.some((m) => m.body.startsWith('Transferida para Suporte N2 · '))).toBe(true);
    expect(sys.some((m) => m.parts.some((p) => p.kind === 'handoff_notice'))).toBe(true);
    expect(await eventos(conv.id, 'conversation.transferred')).toHaveLength(1);
    expect(await t.db.$count(handoffs, eq(handoffs.conversation_id, conv.id))).toBe(1);
  });
});

describe('fila do analista', () => {
  it('contadores e filtros coerentes após uma transferência', async () => {
    const conv = await getOrCreateCurrent(t.seed.users.ana.id, 'sid-a');
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
      t.agora,
    );
    const counts = await countsForAnalyst(t.seed.users.rafael.id);
    expect(counts).toEqual({ all: 7, for_you: 3, with_agent: 2, mine: 0 });
    const paraVoce = await listForAnalyst(t.seed.users.rafael.id, { filter: 'for_you', agora: t.agora });
    expect(paraVoce.map((c) => c.employee.name)).toContain('Ana Souza');
    const bruno = paraVoce.find((c) => c.employee.name === 'Bruno Tavares');
    expect(bruno?.tag).toEqual({ kind: 'agent_asked_help', label: 'Agent pediu ajuda · confiança 41%' });
    const carla = paraVoce.find((c) => c.employee.name === 'Carla Mendes');
    expect(carla?.tag).toEqual({ kind: 'transferred', label: 'Transferida · INC-20388' });
    await applyTransition(conv.id, 'claim', rafael());
    expect((await countsForAnalyst(t.seed.users.rafael.id)).mine).toBe(1);
    const minhas = await listForAnalyst(t.seed.users.rafael.id, { filter: 'mine' });
    expect(minhas[0]?.tag).toEqual({ kind: 'with_me', label: 'Você está atendendo' });
  });

  it('busca por nome, preview e chamado em foco', async () => {
    expect((await listForAnalyst(t.seed.users.rafael.id, { q: 'carla' })).map((c) => c.employee.name)).toEqual([
      'Carla Mendes',
    ]);
    expect((await listForAnalyst(t.seed.users.rafael.id, { q: 'INC-20519' }))[0]?.employee.name).toBe('Elisa Prado');
    expect((await listForAnalyst(t.seed.users.rafael.id, { q: 'wi-fi' }))[0]?.employee.name).toBe('Gabriela Rocha');
  });

  describe('busca da fila', () => {
    const rafa = () => t.seed.users.rafael.id;
    const nomes = (l: Array<{ employee: { name: string } }>) => l.map((c) => c.employee.name);

    /** Conversa da Ana sobre VPN em que a última mensagem não fala de VPN. */
    async function anaFalouDeVpn() {
      const conv = await getOrCreateCurrent(t.seed.users.ana.id, 's');
      await registerEmployeeMessage(conv.id, 'Meu notebook não conecta na VPN, aparece o erro 809', 30);
      await registerEmployeeMessage(conv.id, 'Ok, vou tentar e te aviso', 30);
      return conv;
    }

    it('ignora acento: "fabio" acha Fábio Nunes, pelo nome', async () => {
      const r = await listForAnalyst(rafa(), { q: 'fabio' });
      expect(nomes(r)).toEqual(['Fábio Nunes']);
      expect(r[0]?.match).toEqual({ kind: 'name', text: 'Fábio Nunes' });
    });

    it('procura em todas as mensagens, não só na última, e mostra o trecho', async () => {
      await anaFalouDeVpn();
      for (const q of ['vpn', '809']) {
        const r = await listForAnalyst(rafa(), { q });
        expect(nomes(r), q).toEqual(['Ana Souza']);
        expect(r[0]?.match?.kind).toBe('message');
        expect(r[0]?.match?.text).toContain('VPN, aparece o erro 809');
      }
    });

    it('"ana" acha a Ana pelo nome e não quem só escreveu "analista"', async () => {
      await anaFalouDeVpn();
      expect(nomes(await listForAnalyst(rafa(), { q: 'ana' }))).toEqual(['Ana Souza']);
      expect(nomes(await listForAnalyst(rafa(), { q: 'analis' }))).toEqual(['Carla Mendes', 'Bruno Tavares']);
    });

    it('chamados do funcionário (código e título) vindos do serviço de chamados', async () => {
      const carla = t.seed.users.carla.id;
      const porCodigo = await listForAnalyst(rafa(), {
        q: 'REQ-10460',
        ticketHits: [{ requester_id: carla, code: 'REQ-10460', title: 'Licença do Power BI' }],
      });
      expect(nomes(porCodigo)).toEqual(['Carla Mendes']);
      expect(porCodigo[0]?.match).toEqual({ kind: 'ticket', text: 'REQ-10460 · Licença do Power BI' });
      const porTitulo = await listForAnalyst(rafa(), {
        q: 'diretoria',
        ticketHits: [{ requester_id: carla, code: 'INC-20388', title: 'Acesso à pasta da Diretoria' }],
      });
      expect(nomes(porTitulo)).toEqual(['Carla Mendes']);
    });

    it('nome vem antes de conteúdo', async () => {
      const conv = await getOrCreateCurrent(t.seed.users.bruno.id, 's');
      await registerEmployeeMessage(conv.id, 'A Carla Mendes também está sem acesso', 30);
      expect(nomes(await listForAnalyst(rafa(), { q: 'carla' }))).toEqual(['Carla Mendes', 'Bruno Tavares']);
    });

    it('combina com os filtros', async () => {
      expect(nomes(await listForAnalyst(rafa(), { filter: 'for_you', q: 'carla' }))).toEqual(['Carla Mendes']);
      expect(await listForAnalyst(rafa(), { filter: 'with_agent', q: 'carla' })).toEqual([]);
      expect(nomes(await listForAnalyst(rafa(), { filter: 'with_agent', q: 'figma' }))).toEqual(['Diego Ramos']);
    });

    it('sem busca não há motivo', async () => {
      expect((await listForAnalyst(rafa()))[0]?.match).toBeNull();
    });
  });

  it('encerrada sem analista aparece como resolvida pelo agent', async () => {
    const todas = await listForAnalyst(t.seed.users.rafael.id);
    expect(todas.find((c) => c.employee.name === 'Fábio Nunes')?.tag.kind).toBe('resolved_by_agent');
    expect(todas.find((c) => c.employee.name === 'Diego Ramos')?.tag).toEqual({
      kind: 'agent_handling',
      label: 'Agent atendendo',
    });
  });
});

describe('mensagem do 409 de assumir', () => {
  it('diz quem já assumiu', async () => {
    const carla = t.seed.conversations.carla!;
    await applyTransition(carla, 'claim', rafael());
    const e = await erroDe(applyTransition(carla, 'claim', juliana()));
    expect(e.message).toBe('Rafael Lima já assumiu esta conversa');
  });
});

describe('listMessages (paginação)', () => {
  it('página pelo cursor sem pular nem repetir, mesmo com mensagens no mesmo instante', async () => {
    const conv = await getOrCreateCurrent(t.seed.users.ana.id, 's');
    const base = new Date(t.agora.getTime() - 3_600_000);
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
    const vistas: string[] = [];
    let cursor: string | undefined;
    for (let pagina = 0; pagina < 10; pagina++) {
      const r = await listMessages(conv.id, { limit: 50, cursor });
      vistas.unshift(...r.messages.map((m) => m.id));
      if (!r.next_cursor) break;
      cursor = r.next_cursor;
    }
    expect(vistas).toHaveLength(120);
    expect(new Set(vistas).size).toBe(120);
    const todas = await listMessages(conv.id, { limit: 100 });
    expect(vistas.slice(-100)).toEqual(todas.messages.map((m) => m.id));
  });

  it('cursor inválido ou de outra conversa → página vazia, sem erro', async () => {
    const conv = await getOrCreateCurrent(t.seed.users.ana.id, 's');
    expect((await listMessages(conv.id, { cursor: 'lixo' })).messages).toEqual([]);
  });
});
