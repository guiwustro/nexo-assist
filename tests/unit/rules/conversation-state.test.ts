import { describe, expect, it } from 'vitest';
import { transition, type ConversationEvent } from '@/lib/rules/conversation-state';
import type { ConversationStatus } from '@/lib/contracts/enums';

type Expected = ConversationStatus | 'invalid';
const matrix: Array<[ConversationStatus, ConversationEvent, Expected]> = [
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
  it.each(matrix)('%s --%s--> %s', (state, event, expected) => {
    const r = transition(state, event);
    if (expected === 'invalid') {
      expect(r).toEqual({ ok: false, code: 'invalid_transition' });
    } else {
      expect(r).toEqual({ ok: true, next: expected });
    }
  });
});
