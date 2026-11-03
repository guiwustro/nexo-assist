import { describe, expect, it } from 'vitest';
import { rotulosPara } from '@/lib/agent-engine/agent/rotulos';

describe('rotulosPara', () => {
  it.each([
    ['buscar_meus_chamados', {}, {}, ['consultou seus chamados']],
    ['ver_chamado', { code: 'INC-20311' }, { found: true }, ['consultou o INC-20311', 'calculou o prazo']],
    ['buscar_artigos', { query: 'x' }, {}, ['buscou na central de ajuda']],
    ['montar_rascunho', {}, {}, ['classificou a prioridade', 'consultou o SLA', 'montou o rascunho']],
    ['transferir_para_analista', {}, {}, ['transferiu para um analista']],
    ['oferecer_opcoes', {}, {}, []],
  ])('%s', (tool, input, output, esperado) => {
    expect(rotulosPara(tool, input, output)).toEqual(esperado);
  });
  it('sistema fora troca o rótulo pelo aviso', () => {
    expect(rotulosPara('buscar_meus_chamados', {}, { ok: false, error: 'tickets_unavailable' })).toEqual([
      'sistema de chamados indisponível',
    ]);
  });
  it('ver_chamado não encontrado não calcula prazo', () => {
    expect(rotulosPara('ver_chamado', { code: 'INC-1' }, { found: false })).toEqual(['consultou o INC-1']);
  });
});
