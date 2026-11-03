import { describe, expect, it } from 'vitest';
import { transicao, type ConversationEvent } from '@/lib/regras/conversa-estado';
import type { ConversationStatus } from '@/lib/contracts/enums';

type Esperado = ConversationStatus | 'invalid';
const matriz: Array<[ConversationStatus, ConversationEvent, Esperado]> = [
  ['ai_handling', 'transfer', 'pending'],
  ['ai_handling', 'claim', 'claimed'],
  ['ai_handling', 'release', 'invalid'],
  ['ai_handling', 'close', 'invalid'],
  ['ai_handling', 'employee_message', 'ai_handling'],
  ['pending', 'transfer', 'invalid'],
  ['pending', 'claim', 'claimed'],
  ['pending', 'release', 'ai_handling'],
  ['pending', 'close', 'closed'],
  ['pending', 'employee_message', 'pending'],
  ['claimed', 'transfer', 'invalid'],
  ['claimed', 'claim', 'invalid'],
  ['claimed', 'release', 'ai_handling'],
  ['claimed', 'close', 'closed'],
  ['claimed', 'employee_message', 'claimed'],
  ['closed', 'transfer', 'invalid'],
  ['closed', 'claim', 'invalid'],
  ['closed', 'release', 'invalid'],
  ['closed', 'close', 'invalid'],
  ['closed', 'employee_message', 'ai_handling'],
];

describe('transicao', () => {
  it.each(matriz)('%s --%s--> %s', (estado, evento, esperado) => {
    const r = transicao(estado, evento);
    if (esperado === 'invalid') {
      expect(r).toEqual({ ok: false, code: 'invalid_transition' });
    } else {
      expect(r).toEqual({ ok: true, next: esperado });
    }
  });
});
