export const config = {
  matcher: ['/images/_sp_9709968e2e12062a.pdf', '/images/_sp_9709968e2e12062a.svg'],
};

export default function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Presale PDF/SVG protection
  if (path.includes('_sp_9709968e2e12062a')) {
    if (url.searchParams.get('t') === 'sibyl2026') return;
    return new Response('not found', { status: 404 });
  }

  return new Response('not found', { status: 404 });
}
