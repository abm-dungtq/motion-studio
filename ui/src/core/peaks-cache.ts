// Port of public/peaks-cache.js (commit 22e7611); logic unchanged.
// peaks-cache.js — a small IndexedDB store for what the timeline decodes in the browser: one
// database per kind ("ms-peaks" for waveform peaks, "ms-thumbs" for render thumbnails), one object
// store "v", string keys. A key carries what makes the value stale (file size and mtime, or the
// render's mtime), so a changed file is simply a new key; old keys are dropped once a store holds
// more than LIMIT entries (oldest write first). Every call resolves, never rejects: without
// IndexedDB (private mode, a quota error) the cache is just empty and the caller decodes again.
const LIMIT = 400;
const dbs = new Map<string, Promise<IDBDatabase | null>>(); // name → Promise<IDBDatabase | null>

function open(name: string): Promise<IDBDatabase | null> {
  if (!dbs.has(name)) {
    dbs.set(name, new Promise((resolve) => {
      let req: IDBOpenDBRequest;
      try { req = indexedDB.open(name, 1); } catch { return resolve(null); }
      req.onupgradeneeded = () => req.result.createObjectStore("v");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    }));
  }
  return dbs.get(name)!;
}

function run(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | null): Promise<any> { // loose: each caller reads its own result shape
  return new Promise((resolve) => {
    let tx: IDBTransaction;
    try { tx = db.transaction("v", mode); } catch { return resolve(null); }
    const req = fn(tx.objectStore("v"));
    tx.oncomplete = () => resolve(req?.result ?? null);
    tx.onerror = () => resolve(null);
    tx.onabort = () => resolve(null);
  });
}

// The value under key, or null.
export async function cacheGet(name: string, key: string): Promise<unknown> {
  const db = await open(name);
  if (!db) return null;
  const row = await run(db, "readonly", (s) => s.get(key));
  return row?.value ?? null;
}

// Stores value (anything structured-cloneable: Float32Array, Blob…) under key.
export async function cachePut(name: string, key: string, value: unknown): Promise<boolean> {
  const db = await open(name);
  if (!db) return false;
  const ok = await run(db, "readwrite", (s) => s.put({ value, at: Date.now() }, key));
  trim(db);
  return ok !== null;
}

let trimming = false;
async function trim(db: IDBDatabase): Promise<void> {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await run(db, "readonly", (s) => s.getAllKeys());
    if (!Array.isArray(keys) || keys.length <= LIMIT) return;
    const rows = await run(db, "readonly", (s) => s.getAll());
    const order = keys.map((k: IDBValidKey, i: number): [IDBValidKey, number] => [k, rows?.[i]?.at ?? 0]).sort((a, b) => a[1] - b[1]);
    await run(db, "readwrite", (s) => { for (const [k] of order.slice(0, keys.length - LIMIT)) s.delete(k); return null; });
  } finally { trimming = false; }
}
