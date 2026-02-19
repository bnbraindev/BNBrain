import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token.trim() : '';
  if (token) {
    redirect(`/admin/overview?token=${encodeURIComponent(token)}`);
  }
  redirect('/admin/overview');
}
