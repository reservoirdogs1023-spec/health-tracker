export function PageNavigation({ page }: { page: 'body' | 'run' }) {
  return (
    <nav className="page-navigation" aria-label="ページ切り替え">
      <a href="#/" aria-current={page === 'body' ? 'page' : undefined}>からだ</a>
      <a href="#/run" aria-current={page === 'run' ? 'page' : undefined}>ラン</a>
    </nav>
  );
}
