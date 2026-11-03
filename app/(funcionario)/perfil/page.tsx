import { KeyRound, Lock, Mail } from 'lucide-react';
import { ResetPasswordButton } from '@/components/shell/ResetPasswordButton';
import { requirePageUser } from '@/lib/server/session';

export const metadata = { title: 'Meu perfil · Nexo Assist' };

export default async function PerfilPage() {
  const { user } = await requirePageUser('employee');
  return (
    <div className="flex h-full justify-center overflow-y-auto px-10 py-12">
      <div className="flex w-[600px] flex-col gap-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold text-ink">Meu perfil</h1>
          <p className="text-value text-ink-3">Seus dados de acesso ao service desk de TI.</p>
        </div>

        <section className="flex flex-col rounded-card border border-card-border bg-paper">
          <div className="flex items-center gap-4 border-b border-rule px-6 py-5">
            <span className="w-40 text-body text-ink-3">Nome</span>
            <span className="text-value font-medium text-ink">{user.name}</span>
          </div>
          <div className="flex items-center gap-4 px-6 py-5">
            <span className="w-40 text-body text-ink-3">E-mail corporativo</span>
            <span data-testid="perfil-email" className="flex-1 text-value font-medium text-ink">
              {user.email}
            </span>
            <span className="flex items-center gap-[5px] text-label text-ink-3">
              <Lock size={13} />
              Gerenciado pela TI
            </span>
          </div>
        </section>

        <section className="flex flex-col overflow-hidden rounded-card border border-card-border bg-paper">
          <div className="flex items-center gap-4 p-6">
            <span className="flex size-10 items-center justify-center rounded-full bg-desk">
              <KeyRound size={18} className="text-ink-2" />
            </span>
            <span className="flex flex-1 flex-col gap-[3px]">
              <span className="text-value font-semibold text-ink">Senha</span>
              <span className="text-body text-ink-3">Alterada há 42 dias</span>
            </span>
            <ResetPasswordButton />
          </div>
          <div className="flex items-center gap-2 border-t border-rule bg-desk px-6 py-3 text-[13px] text-ink-3">
            <Mail size={14} />
            Enviaremos um link de redefinição para {user.email}.
          </div>
        </section>
      </div>
    </div>
  );
}
