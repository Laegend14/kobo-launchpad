import fs from 'fs';
import path from 'path';

/**
 * File-based off-chain metadata store.
 *
 * The chain is the source of truth for a token's *existence* (TokenFactory.allTokens[])
 * and its economics (BondingCurve reserves). But two fields can't cheaply live on-chain:
 *   - description (free text)
 *   - image (often a large base64 data-URI from the create form's drag-and-drop)
 *
 * These are written here, once per token, as a single JSON file keyed by the token
 * address. It is:
 *   - durable across restarts (survives on disk),
 *   - shared by every client (the backend is the one reader for all of them),
 *   - 100% free of any external DB / SaaS / API key (plain Node `fs`).
 *
 * A missing file is never fatal — the indexer falls back to a generated default so a
 * token launched before its metadata POST arrives (or the 3 pre-existing tokens) still
 * shows up for everyone with its real on-chain name/symbol.
 */

export interface TokenMetadata {
  address: string;
  curve_address?: string;
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;          // metadata_uri: image URL or short data-URI
  creator_wallet?: string;
  created_at?: string;
}

const DATA_DIR = path.join(__dirname, '..', 'data', 'metadata');

function ensureDir(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* directory already exists — non-fatal */
  }
}

function fileFor(address: string): string {
  // Addresses are the key; lowercase + strip anything that isn't a hex address char
  // so a crafted address can never escape DATA_DIR (path-traversal guard).
  const safe = address.toLowerCase().replace(/[^a-z0-9x]/g, '');
  return path.join(DATA_DIR, `${safe}.json`);
}

/** Write (or overwrite) one token's off-chain metadata. */
export function saveMetadata(meta: TokenMetadata): TokenMetadata {
  ensureDir();
  const record: TokenMetadata = {
    ...meta,
    address: meta.address.toLowerCase(),
    curve_address: meta.curve_address ? meta.curve_address.toLowerCase() : undefined,
    created_at: meta.created_at || new Date().toISOString()
  };
  fs.writeFileSync(fileFor(record.address), JSON.stringify(record, null, 2), 'utf-8');
  return record;
}

/** Read one token's off-chain metadata, or null if none was ever written. */
export function getMetadata(address: string): TokenMetadata | null {
  try {
    const raw = fs.readFileSync(fileFor(address), 'utf-8');
    return JSON.parse(raw) as TokenMetadata;
  } catch {
    return null;
  }
}

/** Read every stored metadata record (used to bulk-merge onto the indexed token list). */
export function getAllMetadata(): Record<string, TokenMetadata> {
  ensureDir();
  const out: Record<string, TokenMetadata> = {};
  let files: string[] = [];
  try {
    files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  } catch {
    return out;
  }
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, f), 'utf-8');
      const meta = JSON.parse(raw) as TokenMetadata;
      if (meta && meta.address) out[meta.address.toLowerCase()] = meta;
    } catch {
      /* skip a corrupt file — never let one bad record break the whole read */
    }
  }
  return out;
}

/** Delete every stored metadata file (used by POST /api/reset). */
export function clearAllMetadata(): void {
  let files: string[] = [];
  try {
    files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  } catch {
    return;
  }
  for (const f of files) {
    try {
      fs.unlinkSync(path.join(DATA_DIR, f));
    } catch {
      /* non-fatal */
    }
  }
}
