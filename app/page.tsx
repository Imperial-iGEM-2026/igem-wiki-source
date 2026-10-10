import Home from './home';
import { pageUser, loginSettings } from './auth';
import { loadContent } from './load-content';
export default async function Page() {
  const user = await pageUser();
  return (
    <Home
      user={user ? { name: user.displayName, id: user.userId } : null}
      initialData={await loadContent()}
      login={loginSettings('/')}
    />
  );
}
