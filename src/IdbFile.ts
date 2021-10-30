import { Converter, Data, isBlob, StringData } from "univ-conv";
import {
  AbstractFile,
  NotFoundError,
  OpenOptions,
  Stats,
  WriteOptions,
} from "univ-fs";
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
    await new Promise<void>((resolve, reject) => {
      const contentStore = idbFS._getObjectStore(
        db,
        CONTENT_STORE,
        "readwrite",
        resolve,
        (ev) => idbFS._onWriteError(reject, path, ev),
        (ev) => idbFS._onAbort(reject, path, ev)
      );
      let range = IDBKeyRange.only(path);
      const request = contentStore.delete(range);
      request.onerror = (ev) => idbFS._onWriteError(reject, path, ev);
    });
  }

  protected async _getData(options: OpenOptions): Promise<Data> {
    const converter = new Converter(options);
    const idbFS = this.idbFS;
    const path = this.path;

    const db = await idbFS._open();
    const data = await new Promise<Blob>((resolve, reject) => {
      const contentStore = idbFS._getObjectStore(
        db as IDBDatabase,
        CONTENT_STORE,
        "readonly",
        () => {
          const result = request.result;
          if (result != null) {
            if (isBlob(result)) {
              idbFS._patch(
                path,
                { accessed: Date.now(), size: result.size } as Stats,
                {}
              );
              resolve(result);
            } else {
              let data: Data;
              if (typeof result === "string") {
                data = {
                  encoding: "BinaryString",
                  value: result,
                } as StringData;
              } else {
                data = result;
              }
              converter
                .toBlob(data)
                .then((blob) => {
                  idbFS._patch(
                    path,
                    { accessed: Date.now(), size: blob.size } as Stats,
                    {}
                  );
                  resolve(blob);
                })
                .catch((e) => idbFS._onReadError(reject, path, e));
            }
          } else {
            idbFS._onNotFound(reject, path, undefined);
          }
        },
        (ev) => idbFS._onReadError(reject, path, ev),
        (ev) => idbFS._onAbort(reject, path, ev)
      );
      const range = IDBKeyRange.only(path);
      const request = contentStore.get(range);
      request.onerror = (ev) => idbFS._onReadError(reject, path, ev);
    });
    return data;
  }

  protected async _write(data: Data, options: WriteOptions): Promise<void> {
    const converter = new Converter(options);
    const idbFS = this.idbFS;
    const path = this.path;
    const db = await idbFS._open();

    let head: Data | undefined;
    if (options.append) {
      try {
        head = await this._getData(options);
      } catch (e) {
        if (e.name !== NotFoundError.name) {
          throw e;
        }
      }
    }

    let content: Blob | ArrayBuffer | string;
    if (idbFS.supportsBlob) {
      content = await converter.toBlob(data);
      if (head) {
        content = new Blob([await converter.toBlob(head), content]);
      }
    } else if (idbFS.supportsArrayBuffer) {
      content = await converter.toArrayBuffer(data);
      if (head) {
        content = new Blob([await converter.toArrayBuffer(head), content]);
      }
    } else {
      content = await converter.toBinaryString(data);
      if (head) {
        content = (await converter.toBinaryString(head)) + content;
      }
    }

    return new Promise<void>((resolve, reject) => {
      const contentStore = idbFS._getObjectStore(
        db as IDBDatabase,
        CONTENT_STORE,
        "readwrite",
        async () => {
          try {
            const size = await converter.getSize(content);
            await idbFS._patch(
              path,
              { modified: Date.now(), size } as Stats,
              {}
            );
            resolve();
          } catch (e) {
            idbFS._onWriteError(reject, path, e);
          }
        },
        (ev) => idbFS._onWriteError(reject, path, ev),
        (ev) => idbFS._onAbort(reject, path, ev)
      );
      const contentReq = contentStore.put(content, path);
      contentReq.onerror = (ev) => idbFS._onWriteError(reject, path, ev);
    });
  }
}
