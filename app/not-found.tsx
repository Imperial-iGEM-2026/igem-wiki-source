import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="wiki-hero">
      <span className="eyebrow">404 / PAGE NOT FOUND</span>
      <h1>Back to the science.</h1>
      <p>This page is not part of the wiki.</p>
      <Link href="/" className="dark-button">
        Return to the homepage
      </Link>
    </main>
  );
}
