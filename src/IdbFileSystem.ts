import {
  AbortError,
  AbstractFileSystem,
  createError,
  Directory,
  File,
  FileSystemOptions,
  HeadOptions,
  NoModificationAllowedError,
  NotFoundError,
  NotReadableError,
  NotSupportedError,
  OperationError,
  PatchOptions,
  Props,
  Stats,
  URLType,
} from "univ-fs";
import { URL } from "url";
import { IdbDirectory } from "./IdbDirectory";
import { IdbFile } from "./IdbFile";

export interface IdbFileSystemOptions extends FileSystemOptions {
  logicalDelete?: boolean;
}

export const ENTRY_STORE = "entries";
export const CONTENT_STORE = "contents";

const indexedDB: IDBFactory = window.indexedDB || (window as any).mozIndexedDB;

export class IdbFileSystem extends AbstractFileSystem {
  private db?: IDBDatabase;

  public supportsArrayBuffer = false;
  public supportsBlob = false;

  constructor(dbName: string, private idbOptions?: IdbFileSystemOptions) {
    super(dbName, idbOptions);
  }

  public async _getEntry(path: string): Promise<Stats> {
    const db = await this._open();
    return new Promise<Stats>((resolve, reject) => {
      const tx = db.transaction([ENTRY_STORE], "readonly");
      const range = IDBKeyRange.only(path);
      tx.onabort = (ev: Event) => reject(this.error(path, ev, AbortError.name));
      const onerror = (ev: Event) =>
        reject(this.error(path, ev, NotReadableError.name));
      tx.onerror = onerror;
      const entryStore = tx.objectStore(ENTRY_STORE);
      const req = entryStore.get(range);
      req.onerror = onerror;
      req.onsuccess = () => {
        if (req.result != null) {
          const stats: Stats = req.result;
          if (stats.deleted) {
            reject(this.error(path, undefined, NotFoundError.name));
          } else {
            resolve(req.result);
          }
        } else {
          reject(this.error(path, undefined, NotFoundError.name));
        }
      };
    });
  }

  public async _head(path: string, _options: HeadOptions): Promise<Stats> {
    return this._getEntry(path);
  }

  public async _open(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    if (this.supportsBlob == null || this.supportsArrayBuffer == null) {
      await this._prepare();
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.repository);
      request.onupgradeneeded = (ev) => {
        const request = ev.target as IDBRequest;
        this.db = request.result as IDBDatabase;
        const objectStoreNames = this.db.objectStoreNames;
        if (!objectStoreNames.contains(ENTRY_STORE)) {
          this.db.createObjectStore(ENTRY_STORE);
        }
        if (!objectStoreNames.contains(CONTENT_STORE)) {
          this.db.createObjectStore(CONTENT_STORE);
        }
      };
      request.onsuccess = (e) => {
        this.db = (e.target as IDBRequest).result as IDBDatabase;
        resolve(this.db);
      };
      const onerror = (ev: Event) =>
        reject(this.error("/", ev, OperationError.name));
      request.onerror = onerror;
      request.onblocked = onerror;
    });
  }

  public async _patch(
    path: string,
    props: Props,
    _options: PatchOptions
  ): Promise<void> {
    let stats = await this._getEntry(path);
    stats = { ...stats, ...props };
    await this._putEntry(path, stats);
  }

  public async _putEntry(path: string, props: Props): Promise<void> {
    const db = await this._open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction([ENTRY_STORE], "readwrite");
      const onerror = (ev: Event) =>
        reject(this.error(path, ev, NoModificationAllowedError.name));
      tx.onabort = (ev: Event) => reject(this.error(path, ev, AbortError.name));
      tx.onerror = onerror;
      const req = tx.objectStore(ENTRY_STORE).put(props, path);
      req.onerror = onerror;
      req.onsuccess = () => resolve();
    });
  }

  public async _rm(path: string): Promise<void> {
    if (this.idbOptions?.logicalDelete) {
      try {
        this._patch(path, { deleted: Date.now() }, {});
      } catch (e) {
        const err = e as any;
        if (err.name !== NotFoundError.name) {
          throw e;
        }
      }
    } else {
      const db = await this._open();
      await new Promise<void>(async (resolve, reject) => {
        const entryTx = db.transaction([ENTRY_STORE], "readwrite");
        const onerror = (ev: Event) =>
          reject(this.error(path, ev, NoModificationAllowedError.name));
        entryTx.onabort = onerror;
        entryTx.onerror = onerror;
        entryTx.oncomplete = () => {
          resolve();
        };
        let range = IDBKeyRange.only(path);
        const request = entryTx.objectStore(ENTRY_STORE).delete(range);
        request.onerror = onerror;
      });
    }
  }

  public dispose() {
    if (this.db == null) {
      return;
    }
    this.db.close();
    delete this.db;
  }

  public error(path: string, e?: any, name?: string) {
    const error = e?.target?.error;
    return createError({
      name: name || OperationError.name,
      repository: this.repository,
      path,
      e: error || e,
    });
  }

  public async getDirectory(path: string): Promise<Directory> {
    return new IdbDirectory(this, path);
  }

  public async getFile(path: string): Promise<File> {
    return new IdbFile(this, path);
  }

  public async toURL(path: string, urlType: URLType = "GET"): Promise<string> {
    if (urlType !== "GET") {
      throw createError({
        name: NotSupportedError.name,
        repository: this.repository,
        path,
        e: `"${urlType}" is not supported`,
      });
    }
    const blob = (await this.readAll(path, { sourceType: "Blob" })) as Blob;
    return URL.createObjectURL(blob);
  }

  protected async _prepare() {
    await new Promise<void>((resolve, reject) => {
      const dbName = "_prepare";
      const onerror = (ev: Event) =>
        reject(this.error("/", ev, OperationError.name));
      const check = () => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("store");
        request.onsuccess = async () => {
          const db = request.result;
          await new Promise<void>((resolve) => {
            const blob = new Blob(["test"]);
            const tx = db.transaction("store", "readwrite");
            const noBlob = () => {
              this.supportsBlob = false;
              resolve();
            };
            tx.oncomplete = () => {
              this.supportsBlob = true;
              resolve();
            };
            tx.onerror = noBlob;
            tx.onabort = noBlob;
            tx.objectStore("store").put(blob, "key");
          });
          await new Promise<void>((resolve) => {
            const buffer = new ArrayBuffer(10);
            const tx = db.transaction("store", "readwrite");
            const noBlob = () => {
              this.supportsArrayBuffer = false;
              resolve();
            };
            tx.oncomplete = () => {
              this.supportsArrayBuffer = true;
              resolve();
            };
            tx.onerror = noBlob;
            tx.onabort = noBlob;
            tx.objectStore("store").put(buffer, "key");
          });
          db.close();
          indexedDB.deleteDatabase(dbName);
          resolve();
        };
        request.onerror = onerror;
      };
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = check;
      req.onerror = check;
      req.onblocked = onerror;
    });
  }
}
