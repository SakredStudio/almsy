/**
 * Almsy Desk v1 — IndexedDB Storage Wrapper (with Node in-memory adapter for tests)
 * Stores:
 *  - settings (orgProfile, numbering state, savedMappings, optional savedSession)
 *  - register (issued and voided receipt records, keyed by serialNumber)
 *
 * Per AG-ALMSY.md §4:
 *  "Nothing persists that doesn't need to: donor rows live in memory for the session
 *   unless the user clicks 'Save this session'."
 */

const DB_NAME = 'almsy_desk_v1';
const DB_VERSION = 1;

export const DEFAULT_ORG_PROFILE = Object.freeze({
  receiptType: 'official', // 'official' | 'acknowledgement'
  legalName: '',
  address: '',
  registrationNumber: '', // Only for 'official' (^\d{9}RR\d{4}$)
  placeOfIssue: '',
  authorizedSignerName: '',
  authorizedSignerTitle: 'Treasurer',
  signatureDataUrl: '',
  logoDataUrl: '',
  receiptPrefix: 'ALM-2026-',
  nextSequence: 1,
  sequencePadding: 5,
  aggregationMode: 'per-gift', // 'per-gift' | 'annual'
  taxYear: 2026,
  includeDuplicateStub: false,
});

function clone(val) {
  if (val === undefined || val === null) return val;
  return JSON.parse(JSON.stringify(val));
}

/**
 * Create an in-memory storage engine (used in Node tests or if IndexedDB is unavailable).
 * Can share a backing `backingStore` object across instances to simulate browser reloads!
 */
export function createMemoryBacking() {
  return {
    settings: new Map(),
    register: new Map(),
  };
}

const defaultMemoryBacking = createMemoryBacking();

export function createAlmsyDb(options = {}) {
  const useIdb =
    !options.backing &&
    typeof globalThis !== 'undefined' &&
    typeof globalThis.indexedDB !== 'undefined' &&
    !options.forceMemory;

  const backing = options.backing || defaultMemoryBacking;
  let idbPromise = null;

  function openIdb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      const req = globalThis.indexedDB.open(options.dbName || DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
        if (!db.objectStoreNames.contains('register')) {
          const regStore = db.createObjectStore('register', { keyPath: 'serialNumber' });
          regStore.createIndex('runId', 'runId', { unique: false });
          regStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return idbPromise;
  }

  async function getSetting(key, fallback = null) {
    if (!useIdb) {
      return backing.settings.has(key) ? clone(backing.settings.get(key)) : clone(fallback);
    }
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : clone(fallback));
      req.onerror = () => reject(req.error);
    });
  }

  async function setSetting(key, value) {
    if (!useIdb) {
      backing.settings.set(key, clone(value));
      return clone(value);
    }
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.put(clone(value), key);
      tx.oncomplete = () => resolve(clone(value));
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteSetting(key) {
    if (!useIdb) {
      backing.settings.delete(key);
      return;
    }
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getOrgProfile() {
    const saved = await getSetting('orgProfile', null);
    return {
      ...DEFAULT_ORG_PROFILE,
      ...(saved || {}),
    };
  }

  async function saveOrgProfile(partialProfile) {
    const current = await getOrgProfile();
    const next = {
      ...current,
      ...partialProfile,
    };
    // Ensure nextSequence can never be decremented below existing highest sequence + 1
    const highestIssued = await getHighestSequence(next.receiptPrefix);
    if (Number(next.nextSequence) <= highestIssued) {
      next.nextSequence = highestIssued + 1;
    }
    if (!Number.isInteger(Number(next.nextSequence)) || Number(next.nextSequence) < 1) {
      next.nextSequence = Math.max(1, highestIssued + 1);
    } else {
      next.nextSequence = Number(next.nextSequence);
    }
    await setSetting('orgProfile', next);
    return next;
  }

  async function getAllRegisterEntries() {
    if (!useIdb) {
      return Array.from(backing.register.values()).map(clone);
    }
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('register', 'readonly');
      const store = tx.objectStore('register');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function getHighestSequence(prefix) {
    const entries = await getAllRegisterEntries();
    let maxSeq = 0;
    for (const entry of entries) {
      if (!prefix || entry.prefix === prefix || String(entry.serialNumber).startsWith(prefix)) {
        const seq = Number(entry.sequenceNumber || 0);
        if (seq > maxSeq) maxSeq = seq;
      }
    }
    return maxSeq;
  }

  async function appendRegisterEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    if (!useIdb) {
      for (const entry of entries) {
        if (backing.register.has(entry.serialNumber)) {
          throw new Error(`Duplicate receipt serial number cannot be reused: ${entry.serialNumber}`);
        }
        backing.register.set(entry.serialNumber, clone(entry));
      }
      return entries.map(clone);
    }
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('register', 'readwrite');
      const store = tx.objectStore('register');
      for (const entry of entries) {
        store.add(clone(entry));
      }
      tx.oncomplete = () => resolve(entries.map(clone));
      tx.onerror = () => reject(tx.error || new Error('Failed to append register entries'));
    });
  }

  async function updateRegisterEntry(serialNumber, patch) {
    if (!useIdb) {
      const existing = backing.register.get(serialNumber);
      if (!existing) throw new Error(`Register entry not found: ${serialNumber}`);
      const updated = { ...clone(existing), ...clone(patch), serialNumber };
      backing.register.set(serialNumber, updated);
      return clone(updated);
    }
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('register', 'readwrite');
      const store = tx.objectStore('register');
      const getReq = store.get(serialNumber);
      let updatedRecord = null;
      getReq.onsuccess = () => {
        if (!getReq.result) {
          reject(new Error(`Register entry not found: ${serialNumber}`));
          return;
        }
        updatedRecord = { ...getReq.result, ...clone(patch), serialNumber };
        store.put(updatedRecord);
      };
      tx.oncomplete = () => resolve(updatedRecord);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getSavedMappings() {
    return (await getSetting('savedMappings', {})) || {};
  }

  async function saveColumnMapping(name, mapping) {
    const all = await getSavedMappings();
    all[name] = clone(mapping);
    await setSetting('savedMappings', all);
    return all;
  }

  async function saveDonorSession(sessionPayload) {
    await setSetting('savedSession', {
      ...clone(sessionPayload),
      savedAt: new Date().toISOString(),
    });
  }

  async function getSavedDonorSession() {
    return await getSetting('savedSession', null);
  }

  async function clearSavedDonorSession() {
    await deleteSetting('savedSession');
  }

  return {
    getSetting,
    setSetting,
    deleteSetting,
    getOrgProfile,
    saveOrgProfile,
    getAllRegisterEntries,
    getHighestSequence,
    appendRegisterEntries,
    updateRegisterEntry,
    getSavedMappings,
    saveColumnMapping,
    saveDonorSession,
    getSavedDonorSession,
    clearSavedDonorSession,
  };
}
