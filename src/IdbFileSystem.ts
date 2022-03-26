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
  Props,
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
  noatime?: boolean;
}

export class IdbFileSystem extends AbstractFileSystem {
  public supportsArrayBuffer: boolean | undefined;
  public supportsBlob: boolean | undefined;

  constructor(dbName: string, public idbOptions?: IdbFileSystemOptions) {
    super(dbName, idbOptions);
  }

  public override _fixProps(props: Props, stats: Stats) {
    if (typeof props["size"] !== "number") {
      if (stats.size == null) {
        delete props["size"];
      } else {
        props["size"] = stats.size;
      }
    }
    if (typeof props["etag"] !== "string") {
      if (!stats.etag) {
        delete props["etag"];
      } else {
        props["etag"] = stats.etag;
      }
    }
    if (typeof props["accessed"] !== "number" && stats.accessed) {
      props["accessed"] = stats.accessed;
    }
    if (typeof props["created"] !== "number" && stats.created) {
      props["created"] = stats.created;
    }
    if (typeof props["modified"] !== "number" && stats.modified) {
      props["modified"] = stats.modified;
    }
  }

  public async _getDirectory(path: string): Promise<Directory> {
    return Promise.resolve(new IdbDirectory(this, path));
  }

  public async _getEntry(path: string): Promise<Stats> {
    const db = await this._open();
    try {
      return new Promise<Stats>((resolve, reject) => {
        const entryStore = this._getObjectStore(
          db,
          ENTRY_STORE,
          "readonly",
          () => {
            if (req.result != null) {
              resolve(req.result as Stats);
            } else {
              this._onNotFound(reject, path, undefined);
            }
          },
          (ev) => this._onReadError(reject, path, ev),
          (ev) => this._onAbort(reject, path, ev)
        );
        const range = IDBKeyRange.only(path);
        const req = entryStore.get(range);
        req.onerror = (ev) => this._onReadError(reject, path, ev);
      });
    } finally {
      db.close();
    }
  }

  public async _getFile(path: string): Promise<File> {
    return Promise.resolve(new IdbFile(this, path));
  }

  public _getObjectStore(
    db: IDBDatabase,
    storeName: string,
    mode: IDBTransactionMode,
    oncomplete: () => void,
    onerror: (reason?: any) => void, // eslint-disable-line
    onabort: (reason?: any) => void // eslint-disable-line
  ): IDBObjectStore {
    const tx = db.transaction([storeName], mode);
    tx.onabort = onabort;
    tx.onerror = onerror;
    tx.oncomplete = oncomplete;
    return tx.objectStore(storeName);
  }

  public async _head(path: string): Promise<Stats> {
    return this._getEntry(path);
  }

  /* eslint-disable */
  public _onAbort(reject: (reason?: any) => void, path: string, ev: any) {
    reject(this.error(path, ev, AbortError.name));
  }

  public _onBlockError(reject: (reason?: any) => void, path: string, ev: any) {
    reject(this.error(path, ev, TimeoutError.name));
  }

  public _onNotFound(reject: (reason?: any) => void, path: string, ev: any) {
    reject(this.error(path, ev, NotFoundError.name));
  }

  public _onReadError(reject: (reason?: any) => void, path: string, ev: any) {
    reject(this.error(path, ev, NotReadableError.name));
  }

  public _onWriteError(reject: (reason?: any) => void, path: string, ev: any) {
    reject(this.error(path, ev, NoModificationAllowedError.name));
  }

  /* eslint-enable */
  public async _open(): Promise<IDBDatabase> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
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
            const entryStore = this._getObjectStore(
              db,
              ENTRY_STORE,
              "readwrite",
              () => res(req.result as Stats),
              (ev) => this._onReadError(reject, "/", ev),
              (ev) => this._onAbort(rej, "/", ev)
            );
            const req = entryStore.get("/");
            req.onerror = (ev) => this._onReadError(reject, "/", ev);
          });
          if (!stats) {
            await new Promise<void>((res, rej) => {
              const entryStore = this._getObjectStore(
                db,
                ENTRY_STORE,
                "readwrite",
                () => {
                  res();
                },
                (ev) => this._onWriteError(reject, "/", ev),
                (ev) => this._onAbort(rej, "/", ev)
              );
              const now = Date.now();
              const req = entryStore.put(
                { created: now, modified: now } as Stats,
                "/"
              );
              req.onerror = (ev) => this._onWriteError(reject, "/", ev);
            });
          }
        }
        db.onerror = (ev) => {
          console.warn(this.error("", ev, OperationError.name));
        };
        db.onabort = (ev) => {
          console.warn(this.error("", ev, AbortError.name));
        };
        resolve(db);
      };
      request.onerror = (ev) => this._onReadError(reject, "", ev);
      request.onblocked = (ev) => this._onBlockError(reject, "", ev);
    });

    return db;
  }

  public async _patch(
    path: string,
    props: Props,
    _options: PatchOptions // eslint-disable-line
  ): Promise<void> {
    await this._putEntry(path, props);
  }

  public async _putEntry(path: string, props: Props): Promise<void> {
    const db = await this._open();
    try {
      return new Promise<void>((resolve, reject) => {
        const entryStore = this._getObjectStore(
          db,
          ENTRY_STORE,
          "readwrite",
          resolve,
          (ev) => this._onWriteError(reject, path, ev),
          (ev) => this._onAbort(reject, path, ev)
        );
        const req = entryStore.put(props, path);
        req.onerror = (ev) => this._onWriteError(reject, path, ev);
      });
    } finally {
      db.close();
    }
  }

  public async _rm(path: string): Promise<void> {
    const db = await this._open();
    try {
      await new Promise<void>((resolve, reject) => {
        const entryStore = this._getObjectStore(
          db,
          ENTRY_STORE,
          "readwrite",
          resolve,
          (ev) => this._onWriteError(reject, path, ev),
          (ev) => this._onAbort(reject, path, ev)
        );
        const range = IDBKeyRange.only(path);
        const request = entryStore.delete(range);
        request.onerror = (ev) => this._onWriteError(reject, path, ev);
      });
    } finally {
      db.close();
    }
  }

  public async _toURL(
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
        e: { message: `"${path}" is not a directory` },
      });
    }
    const blob = await this.read(path, "blob");
    return URL.createObjectURL(blob);
  }

  public error(
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

  public supportDirectory(): boolean {
    return true;
  }
}
