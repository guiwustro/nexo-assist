import type { Metadata } from 'next';
import { Newsreader, Schibsted_Grotesk } from 'next/font/google';
import './globals.css';

const sans = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-schibsted', display: 'swap' });
const display = Newsreader({ subsets: ['latin'], variable: '--font-newsreader', display: 'swap' });

export const metadata: Metadata = {
  title: 'Nexo Assist',
  description: 'Service desk de TI da Nexo',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
