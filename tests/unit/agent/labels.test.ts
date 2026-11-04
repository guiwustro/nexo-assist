import { describe, expect, it } from 'vitest';
import { labelsFor } from '@/lib/agent-engine/agent/labels';

describe('rotulosPara', () => {
  it.each([
    ['list_my_tickets', {}, {}, ['consultou seus chamados']],
    ['get_ticket', { code: 'INC-20311' }, { found: true }, ['consultou o INC-20311', 'calculou o prazo']],
    ['search_articles', { query: 'x' }, {}, ['buscou na central de ajuda']],
    ['build_draft', {}, {}, ['classificou a prioridade', 'consultou o SLA', 'montou o rascunho']],
    ['transfer_to_analyst', {}, {}, ['transferiu para um analista']],
    ['offer_options', {}, {}, []],
  ])('%s', (tool, input, output, esperado) => {
    expect(labelsFor(tool, input, output)).toEqual(esperado);
  });
  it('sistema fora troca o rótulo pelo aviso', () => {
    expect(labelsFor('list_my_tickets', {}, { ok: false, error: 'tickets_unavailable' })).toEqual([
      'sistema de chamados indisponível',
    ]);
  });
  it('get_ticket não encontrado não calcula prazo', () => {
    expect(labelsFor('get_ticket', { code: 'INC-1' }, { found: false })).toEqual(['consultou o INC-1']);
  });
  it('rascunho recusado por duplicidade não diz que montou nada', () => {
    expect(labelsFor('build_draft', {}, { ok: false, error: 'possible_duplicate' })).toEqual(['consultou seus chamados']);
  });
});
