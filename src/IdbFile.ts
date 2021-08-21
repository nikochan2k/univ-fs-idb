import {
  AbstractFile,
  AbstractReadStream,
  AbstractWriteStream,
  createError,
  OpenOptions,
  OpenWriteOptions,
  joinPaths,
} from "univ-fs";
import { WfsWriteStream } from "./IdbWriteStream";
import { IdbFileSystem } from "./IdbFileSystem";
import { IdbReadStream } from "./IdbReadStream";

export class IdbFile extends AbstractFile {
  constructor(file: IdbFileSystem, path: string) {
    super(file, path);
  }

  public async _createReadStream(
    options: OpenOptions
  ): Promise<AbstractReadStream> {
    return new IdbReadStream(this, options);
  }

  public async _createWriteStream(
    options: OpenWriteOptions
  ): Promise<AbstractWriteStream> {
    const fs = await (this.fs as IdbFileSystem)._getFS();
    if (options.create) {
      await new Promise<void>((resolve, reject) => {
        const fullPath = joinPaths(this.fs.repository, this.path);
        fs.root.getFile(
          fullPath,
          { create: true },
          () => resolve(),
          (e) =>
            reject(
              createError({
                repository: this.fs.repository,
                path: this.path,
                e,
              })
            )
        );
      });
    }
    return new WfsWriteStream(this, options);
  }

  public async _rm(): Promise<void> {
    const fs = await (this.fs as IdbFileSystem)._getFS();
    return new Promise<void>((resolve, reject) => {
      const fullPath = joinPaths(this.fs.repository, this.path);
      fs.root.getFile(
        fullPath,
        { create: false },
        (entry) =>
          entry.remove(resolve, (e) =>
            reject(
              createError({
                repository: this.fs.repository,
                path: this.path,
                e,
              })
            )
          ),
        (e) =>
          reject(
            createError({
              repository: this.fs.repository,
              path: this.path,
              e,
            })
          )
      );
    });
  }
}
