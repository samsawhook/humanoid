'use client'

/**
 * Root-level error boundary.
 *
 * `error.tsx` only catches failures inside a route segment — anything thrown by the
 * root layout itself escapes it and produces Next's generic "Application error" page
 * with nothing but a digest. This catches that case, so there is no path where the
 * screen tells you less than the message does.
 *
 * It has to render its own <html> and <body>, because the layout that normally
 * provides them is exactly what failed.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 24,
          background: '#0f1115',
          color: '#e6e8ec',
          font: '15px/1.55 ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: 20, margin: '0 0 10px' }}>Life Dash failed to render</h1>

        <div
          style={{
            borderLeft: '3px solid #f87171',
            background: '#171a21',
            padding: '10px 14px',
            borderRadius: '0 6px 6px 0',
            marginBottom: 16,
          }}
        >
          <strong>{error.message || 'No message — server-side exception.'}</strong>
          {error.digest && (
            <div style={{ color: '#9aa3b2', marginTop: 6, fontSize: 13 }}>
              Digest <code>{error.digest}</code>
            </div>
          )}
        </div>

        <p>
          <a href="/api/health" style={{ color: '#7dd3fc' }}>
            /api/health
          </a>{' '}
          reports environment, database connectivity and row counts as JSON. It never
          throws, so it works even when this does.
        </p>

        <button
          onClick={reset}
          style={{
            background: '#171a21',
            color: '#e6e8ec',
            border: '1px solid #262b36',
            borderRadius: 6,
            padding: '8px 14px',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
