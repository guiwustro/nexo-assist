import type { Article } from '@/lib/agent-engine/knowledge/search';
import type { Affected, Category, Priority, TicketStatus, TicketType } from '@/lib/contracts/enums';

export type UserKey = 'ana' | 'carla' | 'bruno' | 'diego' | 'elisa' | 'fabio' | 'gabriela' | 'rafael' | 'juliana';

export type SeedUser = {
  key: UserKey;
  id: string;
  email: string;
  name: string;
  role: 'employee' | 'analyst';
  department: string;
  support_level: 'N1' | 'N2' | null;
};

/** Senha de todos os usuários do seed (demonstração; documentada no README). */
export const DEMO_PASSWORD = 'nexo2026';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const SEED_USERS: SeedUser[] = [
  { key: 'ana', id: uid(1), email: 'ana.souza@nexo.com.br', name: 'Ana Souza', role: 'employee', department: 'Financeiro', support_level: null },
  { key: 'carla', id: uid(2), email: 'carla.mendes@nexo.com.br', name: 'Carla Mendes', role: 'employee', department: 'Comercial', support_level: null },
  { key: 'bruno', id: uid(3), email: 'bruno.tavares@nexo.com.br', name: 'Bruno Tavares', role: 'employee', department: 'Operações', support_level: null },
  { key: 'diego', id: uid(4), email: 'diego.ramos@nexo.com.br', name: 'Diego Ramos', role: 'employee', department: 'Marketing', support_level: null },
  { key: 'elisa', id: uid(5), email: 'elisa.prado@nexo.com.br', name: 'Elisa Prado', role: 'employee', department: 'Jurídico', support_level: null },
  { key: 'fabio', id: uid(6), email: 'fabio.nunes@nexo.com.br', name: 'Fábio Nunes', role: 'employee', department: 'Logística', support_level: null },
  { key: 'gabriela', id: uid(7), email: 'gabriela.rocha@nexo.com.br', name: 'Gabriela Rocha', role: 'employee', department: 'Comercial', support_level: null },
  { key: 'rafael', id: uid(8), email: 'rafael.lima@nexo.com.br', name: 'Rafael Lima', role: 'analyst', department: 'Service desk de TI', support_level: 'N2' },
  { key: 'juliana', id: uid(9), email: 'juliana.costa@nexo.com.br', name: 'Juliana Costa', role: 'analyst', department: 'Service desk de TI', support_level: 'N1' },
];

export const userByKey = (k: UserKey): SeedUser => {
  const u = SEED_USERS.find((x) => x.key === k);
  if (!u) throw new Error(`usuário de seed desconhecido: ${k}`);
  return u;
};

const H = 3600_000;
const D = 24 * H;

export type SeedTicket = {
  code: string;
  owner: UserKey;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  subcategory: string | null;
  priority: Priority;
  affected: Affected;
  status: TicketStatus;
  assignee_name: string | null;
  /** Deslocamentos em ms para trás a partir do "agora" do seed. */
  created_ago: number;
  last_update_ago: number;
  resolved_ago: number | null;
};

export const SEED_TICKETS: SeedTicket[] = [
  {
    code: 'INC-20311', owner: 'ana', type: 'incident', title: 'Notebook lento após atualização do Windows',
    description: 'Depois da atualização do Windows o notebook demora vários minutos para abrir o Excel e o Teams.',
    category: 'hardware', subcategory: 'Notebook', priority: 'medium', affected: 'me', status: 'awaiting_analyst',
    assignee_name: null, created_ago: 6 * D, last_update_ago: 6 * D, resolved_ago: null,
  },
  {
    code: 'INC-20298', owner: 'ana', type: 'incident', title: 'Acesso à pasta Financeiro no SharePoint',
    description: 'Sem acesso à pasta Financeiro/Fechamento no SharePoint desde a troca de equipe.',
    category: 'access', subcategory: 'SharePoint', priority: 'medium', affected: 'me', status: 'in_progress',
    assignee_name: 'Juliana Costa', created_ago: 2 * D, last_update_ago: 1 * H, resolved_ago: null,
  },
  {
    code: 'REQ-10442', owner: 'ana', type: 'request', title: 'Segundo monitor para home office',
    description: 'Pedido de um segundo monitor de 24" para o home office.',
    category: 'hardware', subcategory: 'Monitor', priority: 'low', affected: 'me', status: 'approved',
    assignee_name: 'Rafael Lima', created_ago: 9 * D, last_update_ago: 2 * D, resolved_ago: null,
  },
  {
    code: 'INC-20150', owner: 'ana', type: 'incident', title: 'Senha do SAP bloqueada',
    description: 'Senha do SAP bloqueada após três tentativas.',
    category: 'access', subcategory: 'SAP', priority: 'medium', affected: 'me', status: 'resolved',
    assignee_name: 'Juliana Costa', created_ago: 5 * D, last_update_ago: 4 * D, resolved_ago: 4 * D,
  },
  {
    code: 'INC-19877', owner: 'ana', type: 'incident', title: 'Outlook não sincroniza no celular',
    description: 'O Outlook do celular parou de receber e-mails.',
    category: 'email', subcategory: 'Celular', priority: 'low', affected: 'me', status: 'resolved',
    assignee_name: 'Juliana Costa', created_ago: 62 * D, last_update_ago: 60 * D, resolved_ago: 60 * D,
  },
  {
    code: 'INC-19410', owner: 'ana', type: 'incident', title: 'Troca de senha da rede',
    description: 'Senha da rede expirada, troca orientada pelo analista.',
    category: 'access', subcategory: null, priority: 'low', affected: 'me', status: 'closed',
    assignee_name: 'Rafael Lima', created_ago: 111 * D, last_update_ago: 110 * D, resolved_ago: 110 * D,
  },
  {
    code: 'INC-20388', owner: 'carla', type: 'incident', title: 'Acesso à pasta da Diretoria',
    description: 'Preciso de acesso à pasta da Diretoria para a apresentação de resultados.',
    category: 'access', subcategory: 'SharePoint', priority: 'high', affected: 'me', status: 'open',
    assignee_name: null, created_ago: 3 * H, last_update_ago: 1 * H, resolved_ago: null,
  },
  {
    code: 'REQ-10460', owner: 'carla', type: 'request', title: 'Licença do Power BI',
    description: 'Licença Pro do Power BI para montar os painéis do time comercial.',
    category: 'software', subcategory: 'Power BI', priority: 'low', affected: 'me', status: 'open',
    assignee_name: null, created_ago: 1 * D, last_update_ago: 1 * D, resolved_ago: null,
  },
  {
    code: 'INC-20519', owner: 'elisa', type: 'incident', title: 'Teclado do notebook com teclas falhando',
    description: 'As teclas A, S e D do notebook falham com frequência.',
    category: 'hardware', subcategory: 'Notebook', priority: 'medium', affected: 'me', status: 'open',
    assignee_name: null, created_ago: 2 * H, last_update_ago: 2 * H, resolved_ago: null,
  },
];

export const SEED_ARTICLES: Article[] = [
  {
    slug: 'vpn-erro-809',
    title: 'VPN com erro 809',
    body: 'VPN com erro 809: reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.',
    tags: ['vpn', '809', 'erro', 'rede', 'conexao', 'conectar'],
    applies_to: 'Windows 10',
  },
  {
    slug: 'horario-service-desk',
    title: 'Horário do service desk',
    body: 'Horário do service desk: de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.',
    tags: ['horario', 'atendimento', 'service desk', 'plantao', 'expediente', 'funciona'],
    applies_to: null,
  },
  {
    slug: 'redefinir-senha',
    title: 'Como redefinir a senha da rede',
    body: 'Acesse senha.nexo.com.br, informe seu e-mail corporativo e siga o link enviado ao seu celular cadastrado. A senha precisa ter 12 caracteres e expira a cada 90 dias.',
    tags: ['senha', 'redefinir', 'esqueci', 'bloqueada', 'rede', 'expirou'],
    applies_to: null,
  },
  {
    slug: 'mfa-novo-celular',
    title: 'Autenticação em dois fatores em um celular novo',
    body: 'Trocou de celular? Antes de formatar o antigo, abra o Microsoft Authenticator e exporte as contas. Sem o aparelho antigo, peça a redefinição do MFA abrindo um chamado de Acesso.',
    tags: ['mfa', 'autenticador', 'authenticator', 'celular', 'dois fatores', 'token'],
    applies_to: null,
  },
  {
    slug: 'email-no-celular',
    title: 'Configurar o e-mail corporativo no celular',
    body: 'Instale o Outlook pela loja do celular, entre com o e-mail corporativo e aprove o acesso no Authenticator. Outros aplicativos de e-mail não são suportados.',
    tags: ['email', 'outlook', 'celular', 'sincronizar', 'configurar'],
    applies_to: null,
  },
  {
    slug: 'solicitar-software',
    title: 'Como pedir a instalação de um software',
    body: 'Softwares homologados ficam no portal de softwares e podem ser instalados sem chamado. Para um software fora do portal, abra uma requisição informando o nome, a versão e a justificativa.',
    tags: ['software', 'instalar', 'programa', 'licenca', 'portal'],
    applies_to: null,
  },
  {
    slug: 'impressora-fila',
    title: 'Impressora com fila travada',
    body: 'Se a impressão não sai, abra Configurações > Impressoras, cancele todos os documentos da fila e reinicie o computador. Se a impressora mostrar erro no painel, abra um chamado de Hardware.',
    tags: ['impressora', 'imprimir', 'fila', 'travada', 'impressao'],
    applies_to: null,
  },
  {
    slug: 'wifi-visitantes',
    title: 'Wi-Fi para visitantes',
    body: 'Visitantes usam a rede Nexo-Visitantes. A senha muda toda segunda-feira e fica no mural da recepção; funcionários podem pedir a senha da semana ao assistente.',
    tags: ['wifi', 'wi-fi', 'visitante', 'rede', 'internet', 'senha'],
    applies_to: null,
  },
];

export const SEED_OFFSETS = { H, D };
