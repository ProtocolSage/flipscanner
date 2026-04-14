import { openDB, type IDBPDatabase } from 'idb';
import type { ScanResult } from './types';

const DB_NAME = 'flipscanner';
const STORE = 'scans';
const VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable on server'));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveScan(scan: ScanResult): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE, scan);
  } catch (e) {
    console.error('saveScan failed', e);
  }
}

export async function loadHistory(limit = 50): Promise<ScanResult[]> {
  try {
    const db = await getDb();
    const all = await db.getAllFromIndex(STORE, 'timestamp');
    return all.reverse().slice(0, limit);
  } catch (e) {
    console.error('loadHistory failed', e);
    return [];
  }
}

export async function deleteScan(id: number): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(STORE, id);
  } catch (e) {
    console.error('deleteScan failed', e);
  }
}

export async function clearHistory(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear(STORE);
  } catch (e) {
    console.error('clearHistory failed', e);
  }
}
