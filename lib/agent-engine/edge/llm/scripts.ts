import type { TurnDecision } from '@/lib/contracts/decision';
import type { Script, StepCtx } from './scripted-model';

/** Algum resultado de tool disse que o sistema de chamados caiu? */
const isDown = (c: StepCtx) =>
  c.results.some((r) => (r.output as { error?: string } | null)?.error === 'tickets_unavailable');

const TICKETS_DOWN_MESSAGE =
  'O sistema de chamados está fora do ar agora e não consegui consultar. Tente de novo em alguns segundos — não vou inventar informação.';

const d = (
  intent: TurnDecision['understanding']['intent'],
  summary: string,
  evidence: string,
  action: TurnDecision['decision']['action'],
  confidence: number,
  why: string,
  rules_applied: string[] = [],
  sources: TurnDecision['decision']['sources'] = [],
): TurnDecision => ({
  understanding: { intent, summary, evidence },
  decision: { action, confidence, why, rules_applied, sources },
});

/** Um roteiro por cenário do E2E. A ordem importa: o primeiro que casar vence. */
export const SCRIPTS: Script[] = [
  {
    id: 'vpn-809',
    match: /vpn[\s\S]*809|809[\s\S]*vpn/i,
    steps: [
      {
        tool_calls: [
          { name: 'list_my_tickets', args: { status: 'open' } },
          { name: 'search_articles', args: { query: 'vpn erro 809' } },
        ],
      },
      {
        tool_calls: (c) =>
          isDown(c)
            ? []
            : [
                {
                  name: 'offer_options',
                  args: {
                    question: 'Qual é o sistema do seu notebook?',
                    options: ['Windows 10', 'Windows 11'],
                  },
                },
              ],
        text: (c) => (isDown(c) ? TICKETS_DOWN_MESSAGE : ''),
      },
      {
        text: 'Encontrei um artigo sobre o erro 809, mas ele vale só para o Windows 10. Qual é o sistema do seu notebook?',
      },
    ],
    decision: ({ text }) =>
      d(
        'open_ticket',
        'Notebook não conecta na VPN, erro 809',
        text.match(/n[ãa]o conecta[^.?!]*/i)?.[0] ?? text,
        'ask',
        0.82,
        'O artigo do erro 809 só resolve no Windows 10; preciso saber o sistema antes de abrir chamado.',
        [
          'Central de ajuda: o artigo do erro 809 vale apenas para Windows 10',
          'Sem duplicidade: nenhum chamado aberto sobre VPN',
        ],
        [{ kind: 'article', id: 'vpn-erro-809', title: 'VPN com erro 809' }],
      ),
  },
  {
    id: 'win10',
    match: /^windows 10$/i,
    steps: [
      {
        text: 'No Windows 10, reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Se continuar, me avise que eu abro um chamado.',
      },
    ],
    decision: ({ text }) =>
      d(
        'question',
        'VPN com erro 809 no Windows 10',
        text,
        'answer',
        0.9,
        'O artigo da central resolve o erro 809 no Windows 10.',
        [],
        [{ kind: 'article', id: 'vpn-erro-809', title: 'VPN com erro 809' }],
      ),
  },
  {
    id: 'win11',
    match: /^windows 11$/i,
    steps: [
      {
        tool_calls: [
          {
            name: 'offer_options',
            args: {
              question: 'Quem mais está sem VPN?',
              options: ['Só eu', 'Minha equipe', 'Toda a empresa', 'Não sei'],
            },
          },
        ],
      },
      { text: 'Certo: no Windows 11 o artigo não resolve, então vamos abrir um chamado.' },
    ],
    decision: ({ text }) =>
      d(
        'open_ticket',
        'VPN com erro 809 no Windows 11',
        text,
        'ask',
        0.85,
        'Para calcular a prioridade preciso saber quem está afetado.',
        ['Anexo A: a prioridade combina impacto (quantas pessoas) e urgência'],
      ),
  },
  {
    id: 'only-me',
    match: /^s[óo] eu/i,
    steps: [
      {
        tool_calls: [
          {
            name: 'build_draft',
            args: {
              kind: 'create',
              title: 'VPN não conecta no Windows 11 (erro 809)',
              description:
                'O notebook com Windows 11 não conecta na VPN e mostra o erro 809. O artigo da central vale só para Windows 10. Só a funcionária está afetada e ela tem um compromisso hoje.',
              type: 'incident',
              category: 'network_vpn',
              affected: 'me',
              blocks_work: true,
              deadline_today: true,
            },
          },
        ],
      },
      {
        text: (c) =>
          isDown(c)
            ? TICKETS_DOWN_MESSAGE
            : 'Montei o rascunho abaixo. Confira os dados e clique em Confirmar para eu abrir o chamado.',
      },
    ],
    decision: ({ text }) =>
      d(
        'open_ticket',
        'Só a funcionária está sem VPN e precisa dela hoje',
        text,
        'draft_create',
        0.88,
        'Impede uma pessoa de trabalhar e há compromisso no mesmo dia: prioridade Alta.',
        [
          'Anexo A · Alta: impede uma pessoa de trabalhar ou há compromisso no mesmo dia (4 horas úteis)',
          'Rascunho antes de criar: o chamado só é aberto com a sua confirmação',
        ],
      ),
  },
  {
    id: 'resolve-current',
    match: /\b(isso )?resolveu\b|sim, resolveu/i,
    steps: [
      {
        tool_calls: [
          {
            name: 'mark_resolved',
            args: { summary: 'O funcionário confirmou que o problema foi resolvido.' },
          },
        ],
      },
      { text: 'Que bom! Vou encerrar este atendimento. Se precisar, é só escrever.' },
    ],
    decision: ({ text }) =>
      d(
        'question',
        'O funcionário confirmou a resolução',
        text,
        'answer',
        0.94,
        'O funcionário confirmou que resolveu.',
      ),
  },
  {
    id: 'resolved',
    match: /resolvid|antig|encerrad|hist[oó]rico/i,
    steps: [
      { tool_calls: [{ name: 'list_my_tickets', args: { status: 'closed', show: true } }] },
      {
        text: (c) => {
          if (isDown(c)) return TICKETS_DOWN_MESSAGE;
          const r = c.results.find((x) => x.toolName === 'list_my_tickets')?.output as
            { tickets?: unknown[] } | undefined;
          const n = r?.tickets?.length ?? 0;
          if (n === 0) return 'Você ainda não tem chamados resolvidos.';
          return `Estes são os seus ${n === 1 ? 'chamado resolvido' : `${n} chamados resolvidos`}. Todos ficam também em "Meus chamados", no menu ao lado.`;
        },
      },
    ],
    decision: ({ text }) =>
      d(
        'status',
        'Quer ver os chamados já resolvidos',
        text,
        'answer',
        0.86,
        'Listei os chamados resolvidos e encerrados.',
      ),
  },
  {
    id: 'status',
    match: /status|como est[aá][\s\S]*chamado|meus chamados/i,
    steps: [
      { tool_calls: [{ name: 'list_my_tickets', args: { status: 'open', show: true } }] },
      {
        text: (c) => {
          if (isDown(c)) return TICKETS_DOWN_MESSAGE;
          const r = c.results.find((x) => x.toolName === 'list_my_tickets')?.output as
            { tickets?: unknown[] } | undefined;
          const n = r?.tickets?.length ?? 0;
          if (n === 0) return 'Você não tem chamados abertos agora.';
          if (n === 1) return 'Este é o seu chamado aberto:';
          return `Você tem ${n} chamados abertos. Qual deles você quer ver?`;
        },
      },
    ],
    decision: ({ text }) =>
      d(
        'status',
        'Quer saber o status de um chamado sem informar o número',
        text,
        'ask',
        0.86,
        'Listei os chamados abertos para a pessoa escolher.',
      ),
  },
  {
    id: 'ticket-by-code',
    match: /^(INC|REQ)-\d+/i,
    steps: [
      { tool_calls: [{ name: 'get_ticket', args: (c: StepCtx) => ({ code: c.match[0].toUpperCase() }) }] },
      {
        text: (c) => {
          if (isDown(c)) return TICKETS_DOWN_MESSAGE;
          const r = c.results.find((x) => x.toolName === 'get_ticket')?.output as
            | {
                found?: boolean;
                overdue?: boolean;
                overdue_label?: string;
                sla_rule?: string;
                ticket?: { code: string; priority: string };
              }
            | undefined;
          if (!r || r.found === false || !r.ticket) {
            return 'Não encontrei esse chamado entre os seus. Só consigo mostrar chamados abertos por você.';
          }
          if (r.overdue) {
            const ago = r.overdue_label?.split(' · ')[0] ?? 'há dias';
            const [prio, deadline] = (r.sla_rule ?? '').split(': ');
            const shortDeadline = deadline?.replace(/ \(.*\)$/, '') ?? 'o prazo';
            return `Está sem atualização ${ago}, acima do prazo de ${shortDeadline} para prioridade ${prio?.toLowerCase() ?? ''}. Quer que eu chame um analista?`;
          }
          return `Aqui está o ${r.ticket.code}. Está dentro do prazo.`;
        },
      },
    ],
    decision: ({ text }) => {
      const code = text.match(/^(INC|REQ)-\d+/i)?.[0]?.toUpperCase() ?? text;
      return d(
        'status',
        `Consultar o chamado ${code}`,
        text,
        'answer',
        0.9,
        'Consultei o chamado pelo código, só entre os da própria pessoa.',
        ['Privacidade: só mostro chamados abertos por quem pergunta'],
        [{ kind: 'ticket', id: code, title: code }],
      );
    },
  },
  {
    id: 'hr',
    match: /f[ée]rias|holerite|reembolso/i,
    steps: [
      {
        text: 'Esse assunto é do RH: pedidos de férias e holerite ficam no Portal do Colaborador. Eu cuido só de TI — se precisar de algo de sistema, acesso ou equipamento, é só falar.',
      },
    ],
    decision: ({ text }) =>
      d(
        'out_of_scope',
        'Pergunta de RH, fora do escopo de TI',
        text,
        'redirect',
        0.95,
        'O Nexo Assist atende só TI; RH fica no Portal do Colaborador.',
        ['Escopo: apenas assuntos de TI; RH, financeiro e facilities são redirecionados'],
      ),
  },
  {
    id: 'hours-question',
    match: /hor[áa]rio/i,
    steps: [
      { tool_calls: [{ name: 'search_articles', args: { query: 'horário do service desk' } }] },
      {
        text: 'O service desk atende de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.',
      },
    ],
    decision: ({ text }) =>
      d(
        'question',
        'Quer saber o horário do service desk',
        text,
        'answer',
        0.93,
        'A central de ajuda tem o horário oficial.',
        [],
        [{ kind: 'article', id: 'horario-service-desk', title: 'Horário do service desk' }],
      ),
  },
  {
    id: 'uncertain',
    match: /n[ãa]o sei explicar/i,
    steps: [
      { text: 'Não tenho certeza do que está acontecendo. Vou chamar um analista para olhar isso com você.' },
    ],
    decision: ({ text }) =>
      d(
        'other',
        'Problema que a pessoa não consegue descrever',
        text,
        'transfer',
        0.41,
        'Sem informação suficiente nem artigo relacionado.',
      ),
  },
  {
    id: 'promise',
    match: /teste promessa/i,
    steps: [{ text: 'Vou te transferir para um analista agora.' }],
    decision: ({ text }) => d('other', 'Teste do guardrail de promessa', text, 'answer', 0.9, 'Respondi.'),
  },
  {
    id: 'invalid-decision',
    match: /teste decis[ãa]o inv[áa]lida/i,
    steps: [{ text: 'Certo, anotado.' }],
    decision: 'invalid',
  },
  {
    id: 'fallback',
    match: /[\s\S]*/,
    steps: [{ text: 'Entendi. Pode me contar um pouco mais sobre o que está acontecendo?' }],
    decision: ({ text }) =>
      d(
        'other',
        'Mensagem sem informação suficiente',
        text || '—',
        'ask',
        0.7,
        'Pedi mais detalhes antes de agir.',
      ),
  },
];
