import { Forbidden } from '@/lib/api/errors';
import type { Session } from './session';

export type RoleRequirement = 'employee' | 'analyst' | 'any';

export function requireRole(session: Session, role: RoleRequirement): void {
  if (role !== 'any' && session.role !== role) throw new Forbidden('forbidden', 'Seu papel não pode fazer isso');
}
