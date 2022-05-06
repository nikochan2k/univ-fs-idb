import {
  AbortError,
  AbstractFileSystem,
  createError,
  Directory,
  ErrorLike,
  File,
  FileSystemOptions,
  NoModificationAllowedError,
  NotFoundError,
  NotReadableError,
  NotSupportedError,
  OperationError,
  PatchOptions,
  Stats,
  TimeoutError,
  TypeMismatchError,
  URLOptions,
} from "univ-fs";
import { IdbDirectory } from "./IdbDirectory";
import { IdbFile } from "./IdbFile";

type VoidType = (value: void | PromiseLike<void>) => void;

export const TEST_STORE = "univ-fs-test";
export const ENTRY_STORE = "univ-fs-entries";
export const CONTENT_STORE = "univ-fs-contents";

const indexedDB: IDBFactory = window.indexedDB || (window as any).mozIndexedDB; // eslint-disable-line

export interface IdbFileSystemOptions extends FileSystemOptions {
  useAccessed?: boolean;
}

export class IdbFileSystem extends AbstractFileSystem {
  public supportsArrayBuffer: boolean | undefined;
  public supportsBlob: boolean | undefined;

  constructor(dbName: string, public idbOptions?: IdbFileSystemOptions) {
    super(dbName, idbOptions);
  }

  public _doGetDirectory(path: string): Promise<Directory> {
    return Promise.resolve(new IdbDirectory(this, path));
  }

  public _doGetFile(path: string): Promise<File> {
    return Promise.resolve(new IdbFile(this, path));
  }

  public async _doHead(path: string): Promise<Stats> {
    return this._getEntry(path);
  }

  public async _doPatch(
    path: string,
    stats: Stats,
    props: Stats,
    _options: PatchOptions // eslint-disable-line
  ): Promise<void> {
    await this._putEntry(path, { ...stats, ...props });
  }

  public async _doRm(path: string): Promise<void> {
    const db = await this._open();
    await new Promise<void>((resolve, reject) => {
      const entryStore = this._getObjectStore(db, ENTRY_STORE, "readwrite");
      const range = IDBKeyRange.only(path);
      const request = entryStore.delete(range);
      request.onsuccess = () => resolve();
      request.onerror = (ev) => this._onWriteError(reject, path, ev);
    });
  }

  public async _doToURL(
    path: string,
    isDirectory: boolean,
    options?: URLOptions
  ): Promise<string> {
    options = { urlType: "GET", ...options };
    const repository = this.repository;
    if (options.urlType !== "GET") {
      throw createError({
        name: NotSupportedError.name,
        repository,
        path,
        e: { message: `"${options.urlType}" is not supported` }, // eslint-disable-line
      });
    }
    if (isDirectory) {
      throw createError({
        name: TypeMismatchError.name,
        repository,
        path,
        e: { message: `"${path}" is not a file` },
      });
    }
    const blob = await this.read(path, "blob");
    return URL.createObjectURL(blob);
  }

  public _error(
    path: string,
    e?: any, // eslint-disable-line
    name?: string
  ) {
    const error = e?.target?.error; // eslint-disable-line
    return createError({
      name: name || OperationError.name,
      repository: this.repository,
      path,
      e: (error || e) as ErrorLike,
    });
  }

  public async _getEntry(path: string): Promise<Stats> {
    const db = await this._open();
    return new Promise<Stats>((resolve, reject) => {
      const entryStore = this._getObjectStore(db, ENTRY_STORE, "readonly");
      const range = IDBKeyRange.only(path);
      const req = entryStore.get(range);
      req.onsuccess = () => {
        if (req.result != null) {
          resolve(req.result as Stats);
        } else {
          this._onNotFound(reject, path, undefined);
        }
      };
      req.onerror = (ev) => this._onReadError(reject, path, ev);
    });
  }

  public _getObjectStore(
    db: IDBDatabase,
    storeName: string,
    mode: IDBTransactionMode
  ): IDBObjectStore {
    const tx = db.transaction([storeName], mode);
    return tx.objectStore(storeName);
  }

  /* eslint-disable */
  public _onAbort(reject: (reason?: any) => void, path: string, ev: any) {
    reject(this._error(path, ev, AbortError.name));
  }

  public _onBlockError(reject: (reason?: any) => void, path: string, ev: any) {
    reject(this._error(path, ev, TimeoutError.name));
  }

  public _onNotFound(reject: (reason?: any) => void, path: string, ev: any) {
    reject(this._error(path, ev, NotFoundError.name));
  }

  public _onReadError(reject: (reason?: any) => void, path: string, ev: any) {
    reject(this._error(path, ev, NotReadableError.name));
  }

  public _onWriteError(reject: (reason?: any) => void, path: string, ev: any) {
    reject(this._error(path, ev, NoModificationAllowedError.name));
  }

  private db?: IDBDatabase;

  /* eslint-enable */
  public async _open(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.repository);
      request.onupgradeneeded = () => {
        const db = request.result;
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
          await new Promise<void>((res) => {
            const testStore = this._getObjectStore(db, TEST_STORE, "readwrite");
            const blob = new Blob(["test"]);
            const req = testStore.put(blob, "blob");
            req.onsuccess = () => this.enableBlob(res, true);
            req.onerror = () => this.enableBlob(res, false);
          });

          await new Promise<void>((res) => {
            const testStore = this._getObjectStore(db, TEST_STORE, "readwrite");
            const buffer = new ArrayBuffer(10);
            const req = testStore.put(buffer, "arraybuffer");
            req.onsuccess = () => this.enableArrayBuffer(res, true);
            req.onerror = () => this.enableArrayBuffer(res, false);
          });

          const stats = await new Promise<Stats>((res, rej) => {
            const entryStore = this._getObjectStore(
              db,
              ENTRY_STORE,
              "readwrite"
            );
            const req = entryStore.get("/");
            req.onsuccess = () => res(req.result as Stats);
            req.onerror = (ev) => this._onReadError(rej, "/", ev);
          });
          if (!stats) {
            await new Promise<void>((res, rej) => {
              const entryStore = this._getObjectStore(
                db,
                ENTRY_STORE,
                "readwrite"
              );
              const now = Date.now();
              const req = entryStore.put(
                { created: now, modified: now } as Stats,
                "/"
              );
              req.onsuccess = () => res();
              req.onerror = (ev) => this._onWriteError(rej, "/", ev);
            });
          }
        }
        db.onerror = (ev) => {
          console.warn(this._error("", ev, OperationError.name));
          this.db = undefined;
        };
        db.onabort = (ev) => {
          console.warn(this._error("", ev, AbortError.name));
          this.db = undefined;
        };
        db.onclose = () => {
          this.db = undefined;
        };
        resolve(db);
      };
      request.onerror = (ev) => this._onReadError(reject, "", ev);
      request.onblocked = (ev) => this._onBlockError(reject, "", ev);
    });

    return this.db;
  }

  public async _putEntry(path: string, props: Stats): Promise<void> {
    const db = await this._open();
    return new Promise<void>((resolve, reject) => {
      const entryStore = this._getObjectStore(db, ENTRY_STORE, "readwrite");
      const req = entryStore.put(props, path);
      req.onsuccess = () => resolve();
      req.onerror = (ev) => this._onWriteError(reject, path, ev);
    });
  }

  public canPatchAccessed(): boolean {
    return this.idbOptions?.useAccessed ?? false;
  }

  public canPatchCreated(): boolean {
    return true;
  }

  public canPatchModified(): boolean {
    return true;
  }

  public supportDirectory(): boolean {
    return true;
  }

  private enableArrayBuffer = (res: VoidType, result: boolean) => {
    this.supportsArrayBuffer = result;
    res();
  };

  private enableBlob = (res: VoidType, result: boolean) => {
    this.supportsBlob = result;
    res();
  };
}
