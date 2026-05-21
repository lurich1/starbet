import { promises as fs } from 'fs'
import path from 'path'

/**
 * Shared helpers for the JSON-file "stores" (users, bets, sub-admins, custom matches).
 *
 * On a real server we read/write files in ./data. On read-only filesystems
 * (Vercel/Lambda/edge), the writes fail — so we keep a per-process in-memory
 * cache as fallback. Data is ephemeral on serverless cold starts; the demo
 * stays functional but does not persist users/bets across instances.
 */
const memCache = new Map<string, string>()

export async function readJsonArray<T>(file: string): Promise<T[]> {
  const cached = memCache.get(file)
  if (cached !== undefined) {
    try {
      const parsed = JSON.parse(cached)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }
  try {
    const raw = await fs.readFile(file, 'utf-8')
    memCache.set(file, raw)
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    memCache.set(file, '[]')
    return []
  }
}

export async function writeJsonArray<T>(file: string, data: T[]): Promise<void> {
  const content = JSON.stringify(data, null, 2)
  memCache.set(file, content)
  try {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, content, 'utf-8')
  } catch {
    // read-only filesystem — in-memory cache is our source of truth here
  }
}
