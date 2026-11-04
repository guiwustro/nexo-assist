import { ProfileDetails } from '@/components/shell/ProfileDetails';
import { requirePageUser } from '@/lib/server/session';

export const metadata = { title: 'Meu perfil · Nexo Assist' };

export default async function ProfilePage() {
  const { user } = await requirePageUser('employee');
  return <ProfileDetails user={user} />;
}
