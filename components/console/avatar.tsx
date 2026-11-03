const PALETA: Array<[string, string]> = [
  ['#DCE9F7', '#0062C4'],
  ['#F6E3D3', '#9A4A12'],
  ['#E6E1F7', '#5B3FC4'],
  ['#DDF0E6', '#1E7A4C'],
  ['#F7E1E6', '#A3324F'],
  ['#E5E8EC', '#3D4656'],
  ['#FBEFD0', '#8A6100'],
];

const ORDEM = ['Ana Souza', 'Carla Mendes', 'Bruno Tavares', 'Diego Ramos', 'Elisa Prado', 'Fábio Nunes', 'Gabriela Rocha'];

export function corDe(nome: string): [string, string] {
  const i = ORDEM.indexOf(nome);
  if (i >= 0) return PALETA[i]!;
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length]!;
}

export function iniciaisDe(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? (p[p.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

export function Avatar({ nome, size = 46, online = false, ring = '#FFFFFF' }: { nome: string; size?: number; online?: boolean; ring?: string }) {
  const [bg, fg] = corDe(nome);
  return (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size >= 46 ? 15.5 : 14.5 }}
    >
      {iniciaisDe(nome)}
      {online && (
        <span className="absolute right-0 bottom-0 size-[11px] rounded-full bg-success" style={{ border: `2px solid ${ring}` }} />
      )}
    </span>
  );
}
