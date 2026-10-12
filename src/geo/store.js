// Where offline terrain tiles live.
//   iPhone app: files in the app's own data folder (Capacitor Filesystem, Directory.Data). iOS does not purge
//               it the way it can purge WebView caches, so a downloaded river stays downloaded.
//   Web:        Cache Storage, with persistent storage requested so the browser keeps it.
// Both expose has / get (-> Blob) / put (Blob) / keys (Set of "z/x/y").
import { Capacitor } from '@capacitor/core';

const forceFs = typeof location !== 'undefined' && new URLSearchParams(location.search).get('dem') === 'fs';
export const NATIVE_STORE = Capacitor.isNativePlatform() || forceFs;

function b64ToBlob(b64) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new Blob([u], { type: 'image/png' });
}
async function blobToB64(blob) {
  const u = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

function fsStore() {
  let fsMod = null;
  const fs = async () => (fsMod ||= await import('@capacitor/filesystem'));
  const INDEX = 'dem/index.json';
  let keys = null; // Set of "z/x/y" on disk
  let dirty = false, saving = null;
  const load = async () => {
    if (keys) return keys;
    const { Filesystem, Directory, Encoding } = await fs();
    try {
      const r = await Filesystem.readFile({ path: INDEX, directory: Directory.Data, encoding: Encoding.UTF8 });
      keys = new Set(JSON.parse(r.data));
    } catch {
      keys = new Set();
    }
    return keys;
  };
  const flush = async () => {
    if (!dirty || saving) return saving;
    dirty = false;
    const { Filesystem, Directory, Encoding } = await fs();
    saving = Filesystem.writeFile({ path: INDEX, data: JSON.stringify([...keys]), directory: Directory.Data, encoding: Encoding.UTF8, recursive: true })
      .catch(() => { dirty = true; })
      .finally(() => { saving = null; if (dirty) flush(); });
    return saving;
  };
  // on the phone, read a saved file through the WebView's own file URL (no base64 over the bridge)
  let root = null;
  const fileUrl = async (k) => {
    const { Filesystem, Directory } = await fs();
    root ||= (await Filesystem.getUri({ path: 'dem', directory: Directory.Data })).uri;
    return Capacitor.convertFileSrc(`${root}/${k}.png`);
  };
  const native = Capacitor.isNativePlatform();
  return {
    kind: 'device',
    async keys() { return load(); },
    async has(k) { return (await load()).has(k); },
    async get(k) {
      if (!(await load()).has(k)) return null;
      if (native) {
        try {
          const r = await fetch(await fileUrl(k));
          if (r.ok) return await r.blob();
        } catch {}
      }
      const { Filesystem, Directory } = await fs();
      try {
        const r = await Filesystem.readFile({ path: `dem/${k}.png`, directory: Directory.Data });
        return typeof r.data === 'string' ? b64ToBlob(r.data) : r.data;
      } catch {
        keys.delete(k); dirty = true;
        return null;
      }
    },
    async put(k, blob) {
      const { Filesystem, Directory } = await fs();
      await Filesystem.writeFile({ path: `dem/${k}.png`, data: await blobToB64(blob), directory: Directory.Data, recursive: true });
      (await load()).add(k);
      dirty = true;
    },
    // phone: the native side downloads straight to the file
    fetchTo: native
      ? async (k, url) => {
          const { Filesystem, Directory } = await fs();
          await Filesystem.downloadFile({ url, path: `dem/${k}.png`, directory: Directory.Data, recursive: true });
          const st = await Filesystem.stat({ path: `dem/${k}.png`, directory: Directory.Data });
          if (!(st.size > 100)) throw new Error('empty tile');
          (await load()).add(k);
          dirty = true;
        }
      : null,
    flush,
    async clear() {
      const { Filesystem, Directory } = await fs();
      await Filesystem.rmdir({ path: 'dem', directory: Directory.Data, recursive: true }).catch(() => {});
      keys = new Set();
    },
  };
}

function cacheStore() {
  const NAME = 'riverguide-dem-v2';
  const URL0 = 'https://dem.local/';
  let c = null;
  const open = async () => (c ||= typeof caches !== 'undefined' ? await caches.open(NAME).catch(() => null) : null);
  let keys = null;
  return {
    kind: 'browser',
    async keys() {
      if (keys) return keys;
      const cache = await open();
      keys = new Set(cache ? (await cache.keys()).map((r) => r.url.slice(URL0.length).replace(/\.png$/, '')) : []);
      return keys;
    },
    async has(k) { return (await this.keys()).has(k); },
    async get(k) {
      const cache = await open();
      const r = cache && (await cache.match(URL0 + k + '.png').catch(() => null));
      return r ? r.blob() : null;
    },
    async put(k, blob) {
      const cache = await open();
      if (!cache) throw new Error('This browser has no offline storage');
      await cache.put(URL0 + k + '.png', new Response(blob, { headers: { 'content-type': 'image/png' } }));
      (await this.keys()).add(k);
    },
    flush: async () => {},
    async clear() {
      if (typeof caches !== 'undefined') await caches.delete(NAME);
      c = null; keys = new Set();
    },
  };
}

export const tileStore = NATIVE_STORE ? fsStore() : cacheStore();

// ask the browser not to evict the download (web only; the app's files are already permanent)
export async function persist() {
  try {
    if (!NATIVE_STORE && navigator.storage?.persist) return await navigator.storage.persist();
  } catch {}
  return NATIVE_STORE;
}
