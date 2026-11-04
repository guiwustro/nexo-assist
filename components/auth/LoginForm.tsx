'use client';

import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Spinner } from '@/components/ui/Spinner';

const CRED_ERROR = 'E-mail ou senha incorretos';

type ApiResult = { data?: { role: 'employee' | 'analyst' }; error?: { code: string; message: string } };

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    if (!password) {
      setError('Informe a senha');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
      });
      const json = (await res.json()) as ApiResult;
      if (!res.ok || !json.data) {
        setError(json.error?.code === 'invalid_credentials' ? CRED_ERROR : 'Não foi possível entrar agora');
        setSending(false);
        return;
      }
      router.replace(json.data.role === 'analyst' ? '/console' : '/atendimento');
      router.refresh();
    } catch {
      setError('Sem conexão. Tente de novo.');
      setSending(false);
    }
  }

  const credErro = error === CRED_ERROR;

  return (
    <form onSubmit={onSubmit} className="flex w-[380px] flex-col gap-7" noValidate>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[40px] leading-tight text-ink">Entrar</h2>
        <p className="text-[15.5px] text-ink-3">Use seu e-mail corporativo e a senha da rede Nexo.</p>
      </div>

      <div className="flex flex-col gap-[18px]">
        <label className="flex flex-col gap-2">
          <span className="text-body font-medium text-ink">E-mail corporativo</span>
          <span
            className={`flex h-11 items-center gap-2.5 rounded-btn border bg-paper pr-2 pl-3.5 focus-within:border-cta ${
              credErro ? 'border-danger' : 'border-input-border'
            }`}
          >
            <Mail size={16} className="text-ink-3" />
            <input
              data-testid="login-email"
              type="email"
              autoComplete="username"
              placeholder="nome.sobrenome@nexo.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-full flex-1 bg-transparent text-value text-ink outline-none placeholder:text-ink-3/60"
            />
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="text-body font-medium text-ink">
              Senha
            </label>
            <button type="button" onClick={() => setForgot(true)} className="text-body font-medium text-primary-text">
              Esqueci minha senha
            </button>
          </div>
          <span
            className={`group flex h-11 items-center gap-2.5 rounded-btn border bg-paper pr-2 pl-3.5 focus-within:border-cta ${
              credErro ? 'border-danger' : 'border-input-border'
            }`}
          >
            <LockKeyhole size={16} className="text-ink-3 group-focus-within:text-primary-text" />
            <input
              id="login-password"
              data-testid="login-password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-full flex-1 bg-transparent text-value text-ink outline-none"
            />
            <button
              type="button"
              aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
              onClick={() => setShow((v) => !v)}
              className="flex size-[30px] items-center justify-center rounded-tag text-ink-3 hover:bg-desk"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
          {forgot && <span className="text-label text-ink-3">Ligue no ramal 4000 para redefinir sua senha.</span>}
          {error && (
            <span data-testid="login-error" className="text-label text-danger-text">
              {error}
            </span>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-[9px] pt-0.5">
          <input type="checkbox" className="sr-only" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span
            className={`flex size-[18px] items-center justify-center rounded-tag ${
              remember ? 'bg-cta' : 'border border-input-border bg-paper'
            }`}
          >
            {remember && <Check size={12} className="text-white" strokeWidth={3} />}
          </span>
          <span className="text-body text-ink-2">Manter conectado neste computador</span>
        </label>
      </div>

      <button
        type="submit"
        data-testid="login-submit"
        disabled={sending}
        className="flex h-11 items-center justify-center gap-2 rounded-btn bg-cta text-[15.5px] font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-80"
      >
        {sending ? <Spinner size={16} testId="login-spinner" /> : null}
        Entrar
        {!sending && <ArrowRight size={16} />}
      </button>
      <div className="border-t border-rule pt-4" />
    </form>
  );
}
