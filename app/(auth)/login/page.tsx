import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { NexoMark } from '@/components/ui/NexoMark';

export const metadata: Metadata = { title: 'Entrar · Nexo Assist' };

const STATS = [
  { value: '8 s', label: 'primeira resposta, em média' },
  { value: '72%', label: 'resolvidos sem fila' },
  { value: '6', label: 'analistas online agora', live: true },
];

export default function LoginPage() {
  return (
    <main className="flex min-h-screen bg-paper">
      <section className="hidden w-[800px] shrink-0 flex-col justify-between bg-ink px-16 pt-10 pb-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <NexoMark size={24} />
          <span className="text-[17px] font-bold text-white">Nexo Assist</span>
        </div>

        <div className="flex flex-col gap-9">
          <div className="flex flex-col gap-[18px]">
            <p className="text-body font-medium text-white/55">Service desk de TI da Nexo</p>
            <h1 className="font-display text-[54px] leading-[1.08] text-white">
              Seu problema de TI, resolvido em uma conversa.
            </h1>
            <p className="w-[520px] text-base leading-relaxed text-white/65">
              Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e abre o
              chamado com você, e chama um analista quando precisa.
            </p>
          </div>

          <div className="pl-24">
            <div className="flex w-[500px] flex-col gap-2.5 rounded-card border border-white/8 bg-white/4 p-[18px]">
              <div className="flex justify-end">
                <div className="rounded-[12px_12px_4px_12px] bg-paper px-3.5 py-[9px] text-body text-ink">
                  Meu notebook não conecta na VPN. Erro 809.
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-label">
                  <span className="font-semibold text-white/80">Nexo Assist</span>
                  <span className="text-white/45">consultou seus chamados · criou um chamado</span>
                </div>
                <div className="w-[380px] rounded-[4px_12px_12px_12px] bg-white/8 px-3.5 py-2.5 text-body text-white">
                  Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
                </div>
                <div className="flex w-fit items-center gap-2 rounded-bubble bg-paper px-3 py-[7px] text-label">
                  <span className="size-[7px] rounded-full bg-warning" />
                  <span className="font-semibold text-ink">INC-20517</span>
                  <span className="text-ink-3">Rede e VPN · Alta · em até 4 h</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-t border-white/10 pt-6">
          {STATS.map((s, i) => (
            <div key={s.label} className={`flex flex-1 flex-col gap-1.5 ${i > 0 ? 'border-l border-white/10 pl-6' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="font-display text-[34px] leading-none text-white">{s.value}</span>
                {s.live && <span className="size-2 rounded-full bg-success" />}
              </div>
              <span className="text-body text-white/55">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-1 flex-col justify-between px-14 py-10">
        <div className="flex items-center justify-end gap-1.5 text-body">
          <span className="text-ink-3">Problema para entrar?</span>
          <span className="font-semibold text-primary-text">Ligue no ramal 4000</span>
        </div>
        <div className="flex justify-center">
          <LoginForm />
        </div>
        <div className="flex justify-between text-label text-ink-3">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </div>
      </section>
    </main>
  );
}
