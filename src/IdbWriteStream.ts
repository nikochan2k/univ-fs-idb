import {
  AbortError,
  AbstractWriteStream,
  createError,
  joinPaths,
  NoModificationAllowedError,
  OpenWriteOptions,
  Source,
} from "univ-fs";
import { IdbFile } from "./IdbFile";
import { IdbFileSystem } from "./IdbFileSystem";

export class WfsWriteStream extends AbstractWriteStream {
  private opened = false;

  constructor(file: IdbFile, options: OpenWriteOptions) {
    super(file, options);
  }

  public async _close(): Promise<void> {
    this.opened = false;
  }

  public async _truncate(size: number): Promise<void> {
    await this._process((writer) => writer.truncate(size));
  }

  public async _write(src: Source): Promise<number> {
    const blob = await this.converter.toBlob(src);
    await this._process(async (writer) => {
      writer.write(blob);
    });
    return blob.size;
  }

  protected async _seek(start: number): Promise<void> {
    const writer = await this._getWriter();
    writer.seek(start);
  }

  private async _getWriter(): Promise<FileWriter> {
    const file = this.file as IdbFile;
    const repository = file.fs.repository;
    const path = file.path;
    const fullPath = joinPaths(repository, path);
    const fs = await (file.fs as IdbFileSystem)._getFS();
    return new Promise<FileWriter>((resolve, reject) => {
      const handle = (e: any) => reject(createError({ repository, path, e }));
      fs.root.getFile(
        fullPath,
        { create: true },
        (entry) =>
          entry.createWriter(async (writer) => {
            if (this.opened) {
              writer.seek(this.position);
              resolve(writer);
            } else {
              this.opened = true;
              if (this.options.append) {
                const stats = await file.head();
                const size = stats.size as number;
                writer.seek(size);
                this.position = size;
                resolve(writer);
              } else {
                const removeEvents = () => {
                  writer.onabort = undefined as any;
                  writer.onerror = undefined as any;
                  writer.onwriteend = undefined as any;
                };
                writer.onabort = (e) => {
                  removeEvents();
                  reject(
                    createError({
                      name: AbortError.name,
                      repository,
                      path,
                      e,
                    })
                  );
                };
                writer.onerror = (e) => {
                  removeEvents();
                  reject(
                    createError({
                      name: NoModificationAllowedError.name,
                      repository,
                      path,
                      e,
                    })
                  );
                };
                writer.onwriteend = () => {
                  removeEvents();
                  resolve(writer);
                };
                writer.truncate(0);
              }
            }
          }, handle),
        handle
      );
    });
  }

  private async _process(handle: (writer: FileWriter) => void) {
    const writer = await this._getWriter();
    return new Promise<void>((resolve, reject) => {
      const file = this.file;
      const repository = file.fs.repository;
      const path = file.path;
      writer.onabort = (e) =>
        reject(
          createError({
            name: AbortError.name,
            repository,
            path,
            e,
          })
        );
      writer.onerror = (e) =>
        reject(
          createError({
            name: NoModificationAllowedError.name,
            repository,
            path,
            e,
          })
        );
      writer.onwriteend = () => {
        resolve();
      };
      handle(writer);
    });
  }
}
