import { Data } from "univ-conv";
import { AbstractFile, ReadOptions, Stats, WriteOptions } from "univ-fs";
import { CONTENT_STORE } from ".";
import { IdbFileSystem } from "./IdbFileSystem";

export class IdbFile extends AbstractFile {
  constructor(private idbFS: IdbFileSystem, path: string) {
    super(idbFS, path);
  }

  public async _rm(): Promise<void> {
    const idbFS = this.idbFS;
    const path = this.path;
    await idbFS._rm(path);
    const db = await idbFS._open();
    try {
      await new Promise<void>((resolve, reject) => {
        const contentStore = idbFS._getObjectStore(
          db,
          CONTENT_STORE,
          "readwrite",
          resolve,
          (ev) => idbFS._onWriteError(reject, path, ev),
          (ev) => idbFS._onAbort(reject, path, ev)
        );
        const range = IDBKeyRange.only(path);
        const request = contentStore.delete(range);
        request.onerror = (ev) => idbFS._onWriteError(reject, path, ev);
      });
    } finally {
      db.close();
    }
  }

  public supportRangeRead(): boolean {
    return false; // TODO
  }

  public supportRangeWrite(): boolean {
    return false; // TODO
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async _load(stats: Stats, _options: ReadOptions): Promise<Data> {
    const idbFS = this.idbFS;
    const db = await idbFS._open();
    try {
      const data = await new Promise<Data>((resolve, reject) => {
        const path = this.path;
        const contentStore = idbFS._getObjectStore(
          db,
          CONTENT_STORE,
          "readonly",
          () => {
            void (async () => {
              const result = request.result as Data;
              if (result != null) {
                if (idbFS.idbOptions?.useAccessed) {
                  await this.idbFS._putEntry(path, {
                    ...stats,
                    accessed: Date.now(),
                  });
                }
                resolve(result);
              } else {
                idbFS._onNotFound(reject, path, undefined);
              }
            })();
          },
          (ev) => idbFS._onReadError(reject, path, ev),
          (ev) => idbFS._onAbort(reject, path, ev)
        );
        const range = IDBKeyRange.only(path);
        const request = contentStore.get(range);
        request.onerror = (ev) => idbFS._onReadError(reject, path, ev);
      });
      return data;
    } finally {
      db.close();
    }
  }

  protected async _save(
    data: Data,
    stats: Stats | undefined,
    options: WriteOptions
  ): Promise<void> {
    let head: Data | undefined;
    if (options.append && stats) {
      head = await this._load(stats, options);
    }

    const idbFS = this.idbFS;
    const converter = this._getConverter();
    let content: Blob | ArrayBuffer | string;
    if (idbFS.supportsBlob) {
      content = await converter.toBlob(data, options);
      if (head) {
        content = new Blob([await converter.toBlob(head, options), content]);
      }
    } else if (idbFS.supportsArrayBuffer) {
      content = await converter.toArrayBuffer(data, options);
      if (head) {
        content = new Blob([
          await converter.toArrayBuffer(head, options),
          content,
        ]);
      }
    } else {
      content = await converter.toBinary(data, options);
      if (head) {
        content = (await converter.toBinary(head, options)) + content;
      }
    }

    const path = this.path;
    const db = await idbFS._open();
    try {
      return new Promise<void>((resolve, reject) => {
        const contentStore = idbFS._getObjectStore(
          db,
          CONTENT_STORE,
          "readwrite",
          () => {
            void (async () => {
              try {
                stats = stats ?? { created: Date.now() };
                stats.size = await converter.getSize(content, options);
                stats.accessed = stats.modified = Date.now();
                await idbFS._patch(path, {}, stats, options);
                resolve();
              } catch (e) {
                idbFS._onWriteError(reject, path, e);
              }
            })();
          },
          (ev) => idbFS._onWriteError(reject, path, ev),
          (ev) => idbFS._onAbort(reject, path, ev)
        );
        const contentReq = contentStore.put(content, path);
        contentReq.onerror = (ev) => idbFS._onWriteError(reject, path, ev);
      });
    } finally {
      db.close();
    }
  }
}
