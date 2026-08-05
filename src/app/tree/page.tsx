/**
 * Placeholder. This view needs the database, which is not yet migrated.
 * See LIFE_DASH.md for the build order.
 */
export default function Page() {
  return (
    <>
      <h1>Tree</h1>
      <div className="note">
        <strong>Not built yet.</strong> This view reads from the database, which has not been
        migrated. Run <code>node --env-file=.env.local scripts/migrate.mjs</code> once the Neon
        host is reachable, then this page gets built against real data.
      </div>
    </>
  )
}
