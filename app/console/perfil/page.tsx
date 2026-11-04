import { ProfileDetails } from '@/components/shell/ProfileDetails';
import { requirePageUser } from '@/lib/server/session';

export const metadata = { title: 'Meu perfil · Console · Nexo Assist' };

export default async function ConsolePerfilPage() {
  const { user } = await requirePageUser('analyst');
  return (
    <div className="flex flex-1 bg-thread">
      <ProfileDetails user={user} />
    </div>
  );
}
