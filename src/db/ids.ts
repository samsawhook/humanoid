/**
 * Deterministic UUIDs from human-readable slugs.
 *
 * The core seed identifies nodes as 'lsat', 'era_mob' and so on, which are far easier
 * to read and edit than UUIDs. The database wants UUIDs. Rather than keep a mapping
 * table — which would drift, and which nothing else needs — a slug hashes to the same
 * UUID every time.
 *
 * That makes seeding idempotent: re-running it upserts the same rows instead of
 * creating a second copy of your goal tree.
 *
 * RFC 4122 v5 (SHA-1, name-based). Stable across machines and Node versions.
 */

import { createHash } from 'node:crypto'

/** Fixed namespace for this application. Changing it re-keys every row — don't. */
const NAMESPACE = '6f1a8c3e-9d2b-4e57-8a10-2c5b7f3d9e41'

function namespaceBytes(): Buffer {
  return Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex')
}

export function uuidForSlug(slug: string): string {
  const hash = createHash('sha1')
  hash.update(namespaceBytes())
  hash.update(Buffer.from(slug, 'utf8'))
  const bytes = hash.digest().subarray(0, 16)

  // Version 5, RFC 4122 variant.
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80

  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/** Null-safe, for optional parent and milestone references. */
export function uuidForSlugOrNull(slug: string | null | undefined): string | null {
  return slug ? uuidForSlug(slug) : null
}
