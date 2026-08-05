'use client'

/**
 * Error boundary.
 *
 * Next.js replaces a thrown server error with a generic page and a digest hash,
 * which is useless when you are looking at it on a phone with no access to the
 * deployment logs. This shows the message and the digest together, and points at the
 * health endpoint, so a failure is diagnosable from the screen you are already on.
 */

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <>
      <h1>Something threw</h1>
      <div className="note">
        <strong>{error.message || 'No message — likely a server-side exception.'}</strong>
        {error.digest && (
          <div className="muted" style={{ marginTop: 6 }}>
            Digest <code>{error.digest}</code> — matches the entry in the Vercel runtime log.
          </div>
        )}
      </div>

      <p>
        Check <a href="/api/health">/api/health</a> — it reports environment, database
        connectivity and row counts as plain JSON, and does not throw.
      </p>

      <button
        onClick={reset}
        style={{
          background: 'var(--panel)',
          color: 'var(--text)',
          border: '1px solid var(--line)',
          borderRadius: 6,
          padding: '8px 14px',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </>
  )
}
