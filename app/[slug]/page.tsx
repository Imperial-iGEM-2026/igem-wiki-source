import { notFound } from 'next/navigation';
import Home from '../home';
import { pageUser, loginSettings } from '../auth';
import { wikiPages } from '../wiki-data';
import { loadContent } from '../load-content';
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const page = wikiPages.find((p) => p.slug === slug);
  return {
    title: page
      ? `${page.title} — Prion Collective`
      : 'Page not found — Prion Collective',
  };
}
export default async function WikiRoute({ params }: Props) {
  const { slug } = await params;
  const wiki = wikiPages.find((p) => p.slug === slug);
  if (!wiki) notFound();
  const user = await pageUser();
  return (
    <Home
      user={user ? { name: user.displayName, id: user.userId } : null}
      initialData={await loadContent()}
      wiki={wiki}
      login={loginSettings('/' + slug)}
    />
  );
}
