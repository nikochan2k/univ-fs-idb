import { Converter, isBlob } from "univ-conv";
import {
  AbstractFile,
  AbstractReadStream,
  AbstractWriteStream,
  NoModificationAllowedError,
  NotFoundError,
  NotReadableError,
  OpenOptions,
  OpenWriteOptions,
  Source,
  Stats,
  StringSource,
} from "univ-fs";
import { CONTENT_STORE } from ".";
import { IdbFileSystem } from "./IdbFileSystem";
import { IdbReadStream } from "./IdbReadStream";
import { IdbWriteStream } from "./IdbWriteStream";

const EMPTY_BLOB = new Blob([]);

export class IdbFile extends AbstractFile {
  public buffer: Blob | undefined;

  constructor(private idbFS: IdbFileSystem, path: string) {
    super(idbFS, path);
  }

  public async _createReadStream(
    options: OpenOptions
  ): Promise<AbstractReadStream> {
    const rs = new IdbReadStream(this, options);
    this.buffer = await this._load(rs.converter);
    return rs;
  }

  public async _createWriteStream(
    options: OpenWriteOptions
  ): Promise<AbstractWriteStream> {
    const ws = new IdbWriteStream(this, options);
    if (options.create) {
      const now = Date.now();
      await this.idbFS._putEntry(this.path, {
        accessed: now,
        created: now,
        modified: now,
        size: 0,
      } as Stats);
      this.buffer = EMPTY_BLOB;
    } else {
      if (options.append) {
        this.buffer = await this._load(ws.converter);
      } else {
        this.buffer = EMPTY_BLOB;
      }
    }
    return ws;
  }

  public async _load(converter: Converter): Promise<Blob> {
    if (!this.buffer) {
      const idbFS = this.idbFS;
      const path = this.path;
      const db = await idbFS._open();
      this.buffer = await new Promise<Blob>((resolve, reject) => {
        const onerror = (ev: any) =>
          reject(idbFS.error(path, ev, NotReadableError.name));
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
                let source: Source;
                if (typeof result === "string") {
                  source = {
                    encoding: "BinaryString",
                    value: result,
                  } as StringSource;
                } else {
                  source = result;
                }
                converter
                  .toBlob(source)
                  .then((blob) => {
                    idbFS._patch(
                      path,
                      { accessed: Date.now(), size: blob.size } as Stats,
                      {}
                    );
                    resolve(blob);
                  })
                  .catch((e) =>
                    reject(idbFS.error(path, e, NotFoundError.name))
                  );
              }
            } else {
              reject(idbFS.error(path, undefined, NotFoundError.name));
            }
          },
          onerror,
          (ev) => idbFS._abort(reject, path, ev)
        );
        const range = IDBKeyRange.only(path);
        const request = contentStore.get(range);
        request.onerror = onerror;
      });
    }
    return this.buffer;
  }

  public async _rm(): Promise<void> {
    const idbFS = this.idbFS;
    const path = this.path;
    await idbFS._rm(path);
    const db = await idbFS._open();
    await new Promise<void>((resolve, reject) => {
      const entryTx = db.transaction([CONTENT_STORE], "readwrite");
      const onerror = (ev: Event) =>
        reject(idbFS.error(path, ev, NoModificationAllowedError.name));
      entryTx.onabort = (ev) => idbFS._abort(reject, path, ev);
      entryTx.onerror = onerror;
      entryTx.oncomplete = () => resolve();
      let range = IDBKeyRange.only(path);
      const request = entryTx.objectStore(CONTENT_STORE).delete(range);
      request.onerror = onerror;
    });
  }

  public async _save(converter: Converter, source: Source): Promise<number> {
    const idbFS = this.idbFS;
    const path = this.path;
    const db = await idbFS._open();
    let content: Blob | ArrayBuffer | string;
    if (idbFS.supportsBlob) {
      content = await converter.toBlob(source);
    } else if (idbFS.supportsArrayBuffer) {
      content = await converter.toArrayBuffer(source);
    } else {
      content = await converter.toBinaryString(source);
    }
    return new Promise<number>((resolve, reject) => {
      const onerror = (ev: any) =>
        reject(idbFS.error(path, ev, NoModificationAllowedError.name));
      const contentStore = idbFS._getObjectStore(
        db as IDBDatabase,
        CONTENT_STORE,
        "readwrite",
        async () => {
          try {
            if (this.idbFS.supportsBlob) {
              this.buffer = content as Blob;
            } else if (this.idbFS.supportsArrayBuffer) {
              this.buffer = new Blob([content]);
            } else {
              this.buffer = await converter.toBlob(source);
            }
            await idbFS._patch(
              path,
              { modified: Date.now(), size: this.buffer.size } as Stats,
              {}
            );
            resolve(this.buffer.size);
          } catch (e) {
            onerror(e);
          }
        },
        onerror,
        (ev) => idbFS._abort(reject, path, ev)
      );
      const contentReq = contentStore.put(content, path);
      contentReq.onerror = onerror;
    });
  }
}
