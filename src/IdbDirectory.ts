import { AbstractDirectory, createError, joinPaths } from "univ-fs";
import { IdbFileSystem } from "./IdbFileSystem";

export class IdbDirectory extends AbstractDirectory {
  constructor(private wfs: IdbFileSystem, path: string) {
    super(wfs, path);
  }

  public async _list(): Promise<string[]> {
    const fs = await this.wfs._getFS();
    return new Promise<string[]>((resolve, reject) => {
      const fullPath = joinPaths(this.fs.repository, this.path);
      fs.root.getDirectory(
        fullPath,
        { create: false },
        (directory) => {
          const reader = directory.createReader();
          reader.readEntries(
            (entries) => {
              const list: string[] = [];
              const from = this.fs.repository.length;
              for (const entry of entries) {
                list.push(entry.fullPath.substr(from));
              }
              resolve(list);
            },
            (e) =>
              reject(
                createError({
                  repository: this.fs.repository,
                  path: this.path,
                  e,
                })
              )
          );
        },
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

  public async _mkcol(): Promise<void> {
    const fs = await this.wfs._getFS();
    return new Promise<void>((resolve, reject) => {
      const fullPath = joinPaths(this.fs.repository, this.path);
      fs.root.getDirectory(
        fullPath,
        { create: true },
        () => resolve(),
        (e) =>
          reject(
            reject(
              createError({
                repository: this.fs.repository,
                path: this.path,
                e,
              })
            )
          )
      );
    });
  }

  public _rmdir(): Promise<void> {
    return this._rd(false);
  }

  public _rmdirRecursively(): Promise<void> {
    return this._rd(true);
  }

  private async _rd(recursive: boolean): Promise<void> {
    const fs = await this.wfs._getFS();
    return new Promise<void>((resolve, reject) => {
      const fullPath = joinPaths(this.fs.repository, this.path);
      fs.root.getDirectory(
        fullPath,
        { create: false },
        (entry) => {
          const handle = (e: any) =>
            reject(
              reject(
                createError({
                  repository: this.fs.repository,
                  path: this.path,
                  e,
                })
              )
            );
          if (recursive) {
            entry.removeRecursively(resolve, handle);
          } else {
            entry.remove(resolve, handle);
          }
        },
        (e) =>
          reject(
            reject(
              createError({
                repository: this.fs.repository,
                path: this.path,
                e,
              })
            )
          )
      );
    });
  }
}
