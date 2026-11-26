import { NextResponse, type NextRequest } from 'next/server'

/**
 * A password on everything, once the site is hosted: set DASH_PASSWORD (and optionally
 * DASH_USER, default "sam") on the host. Unset — running on your own machine — nothing
 * changes. The browser asks once and remembers it, the installed app included.
 *
 * Left open: the icons, the install manifest and the service worker (they hold no data,
 * and browsers fetch the manifest without credentials), and the calendar feed, which has
 * its own token.
 */
export function middleware(req: NextRequest) {
  const password = process.env.DASH_PASSWORD
  if (!password) return NextResponse.next()
  const user = process.env.DASH_USER || 'sam'
  const header = req.headers.get('authorization') ?? ''
  if (header.startsWith('Basic ')) {
    try {
      const [u, p] = atob(header.slice(6)).split(':')
      if (u === user && p === password) return NextResponse.next()
    } catch {}
  }
  return new NextResponse('Password required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Life Dash"' } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|manifest.webmanifest|sw.js|icon|apple-touch-icon|favicon|api/ics|api/health).*)'],
}
