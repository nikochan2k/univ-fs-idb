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
import { IdbDirectory } from "./IdbDirectory";
import { IdbFile } from "./IdbFile";

export interface IdbFileSystemOptions extends FileSystemOptions {
  logicalDelete?: boolean;
}
type VoidType = (value: void | PromiseLike<void>) => void;

export const TEST_STORE = "univ-fs-test";
export const ENTRY_STORE = "univ-fs-entries";
export const CONTENT_STORE = "univ-fs-contents";

const indexedDB: IDBFactory = window.indexedDB || (window as any).mozIndexedDB;

export class IdbFileSystem extends AbstractFileSystem {
  private db?: IDBDatabase;

  public supportsArrayBuffer: boolean | undefined;
  public supportsBlob: boolean | undefined;

  constructor(dbName: string, private idbOptions?: IdbFileSystemOptions) {
    super(dbName, idbOptions);
  }

  public async _getEntry(path: string, db?: IDBDatabase): Promise<Stats> {
    if (!db) {
      db = await this._open();
    }
    return new Promise<Stats>(async (resolve, reject) => {
      const onerror = (ev: any) =>
        reject(this.error(path, ev, NotReadableError.name));
      const entryStore = this._getObjectStore(
        db as IDBDatabase,
        ENTRY_STORE,
        "readonly",
        () => {
          if (req.result != null) {
            resolve(req.result);
          } else {
            reject(this.error(path, undefined, NotFoundError.name));
          }
        },
        onerror,
        (ev) => reject(this.error(path, ev, AbortError.name))
      );
      const range = IDBKeyRange.only(path);
      const req = entryStore.get(range);
      req.onerror = onerror;
    });
  }

  public _getObjectStore(
    db: IDBDatabase,
    storeName: string,
    mode: IDBTransactionMode,
    resolve: () => void,
    onerror: (reason?: any) => void,
    onabort: (reason?: any) => void
  ): IDBObjectStore {
    const tx = (db as IDBDatabase).transaction([storeName], mode);
    tx.onabort = onabort;
    tx.onerror = onerror;
    tx.oncomplete = resolve;
    return tx.objectStore(storeName);
  }

  public async _head(path: string, _options: HeadOptions): Promise<Stats> {
    const stats = await this._getEntry(path);
    if (stats.deleted) {
      throw this.error(path, undefined, NotFoundError.name);
    }
    return stats;
  }

  public async _open(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.repository);
      request.onupgradeneeded = async () => {
        const db = request.result as IDBDatabase;
        const objectStoreNames = db.objectStoreNames;
        if (!objectStoreNames.contains(TEST_STORE)) {
          db.createObjectStore(TEST_STORE);
        }
        if (!objectStoreNames.contains(ENTRY_STORE)) {
          db.createObjectStore(ENTRY_STORE);
        }
        if (!objectStoreNames.contains(CONTENT_STORE)) {
          db.createObjectStore(CONTENT_STORE);
        }
      };
      request.onsuccess = async (e) => {
        const db = (e.target as IDBRequest).result as IDBDatabase;
        if (this.supportsBlob == null || this.supportsArrayBuffer == null) {
          const enableBlob = (res: VoidType, result: boolean) => {
            this.supportsBlob = result;
            res();
          };
          await new Promise<void>((res) => {
            const testStore = this._getObjectStore(
              db,
              TEST_STORE,
              "readwrite",
              () => enableBlob(res, true),
              () => enableBlob(res, false),
              () => enableBlob(res, false)
            );
            const blob = new Blob(["test"]);
            const req = testStore.put(blob, "blob");
            req.onerror = () => enableBlob(res, false);
          });

          const enableArrayBuffer = (res: VoidType, result: boolean) => {
            this.supportsArrayBuffer = result;
            res();
          };
          await new Promise<void>((res) => {
            const testStore = this._getObjectStore(
              db,
              TEST_STORE,
              "readwrite",
              () => enableArrayBuffer(res, true),
              () => enableArrayBuffer(res, false),
              () => enableArrayBuffer(res, false)
            );
            const buffer = new ArrayBuffer(10);
            const req = testStore.put(buffer, "arraybuffer");
            req.onerror = () => enableArrayBuffer(res, false);
          });

          const stats = await new Promise<Stats>((res, rej) => {
            const onerror = (ev: any) =>
              rej(this.error("/", ev, NotReadableError.name));
            const entryStore = this._getObjectStore(
              db,
              ENTRY_STORE,
              "readwrite",
              () => res(req.result),
              () => onerror,
              (ev) => rej(this.error("/", ev, AbortError.name))
            );
            const req = entryStore.get("/");
            req.onerror = onerror;
          });
          if (!stats) {
            await new Promise<void>((res, rej) => {
              const onerror = (ev: any) =>
                rej(this.error("/", ev, NotReadableError.name));
              const entryStore = this._getObjectStore(
                db,
                ENTRY_STORE,
                "readwrite",
                () => {
                  res();
                },
                () => onerror,
                (ev) => rej(this.error("/", ev, AbortError.name))
              );
              const now = Date.now();
              const req = entryStore.put(
                { created: now, modified: now } as Stats,
                "/"
              );
              req.onerror = onerror;
            });
          }
        }
        resolve(db);
      };
      const onerror = (ev: Event) =>
        reject(this.error("/", ev, OperationError.name));
      request.onerror = onerror;
      request.onblocked = onerror;
    });

    /*
    try {
      await this._getEntry("/", this.db);
    } catch (e) {
      if (e.name !== NotFoundError.name) {
        throw e;
      }
      const now = Date.now();
      await this._putEntry("/", { created: now, modified: now }, this.db);
    }
    */

    return this.db;
  }

  public async _patch(
    path: string,
    props: Props,
    _options: PatchOptions
  ): Promise<void> {
    let stats = await this._getEntry(path);
    if (stats.deleted) {
      throw this.error(path, undefined, NotFoundError.name);
    }
    stats = { ...stats, ...props };
    await this._putEntry(path, stats);
  }

  public async _putEntry(
    path: string,
    props: Props,
    db?: IDBDatabase
  ): Promise<void> {
    if (!db) {
      db = await this._open();
    }
    return new Promise<void>((resolve, reject) => {
      const onerror = (ev: any) =>
        reject(this.error(path, ev, NoModificationAllowedError.name));
      const entryStore = this._getObjectStore(
        db as IDBDatabase,
        ENTRY_STORE,
        "readwrite",
        resolve,
        onerror,
        (ev) => reject(this.error(path, ev, AbortError.name))
      );
      const req = entryStore.put(props, path);
      req.onerror = onerror;
    });
  }

  public async _rm(path: string): Promise<void> {
    if (this.idbOptions?.logicalDelete) {
      try {
        await this._patch(path, { deleted: Date.now() }, {});
      } catch (e) {
        if (e.name !== NotFoundError.name) {
          throw e;
        }
      }
    } else {
      const db = await this._open();
      await new Promise<void>(async (resolve, reject) => {
        const onerror = (ev: Event) =>
          reject(this.error(path, ev, NoModificationAllowedError.name));
        const entryStore = this._getObjectStore(
          db as IDBDatabase,
          ENTRY_STORE,
          "readwrite",
          resolve,
          onerror,
          (ev) => reject(this.error(path, ev, AbortError.name))
        );
        let range = IDBKeyRange.only(path);
        const request = entryStore.delete(range);
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
}
