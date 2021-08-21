import {
  AbstractFileSystem,
  createError,
  Directory,
  File,
  FileSystemOptions,
  HeadOptions,
  joinPaths,
  normalizePath,
  NotAllowedError,
  NotSupportedError,
  PatchOptions,
  Props,
  QuotaExceededError,
  Stats,
  URLType,
} from "univ-fs";
import { IdbDirectory } from "./IdbDirectory";
import { IdbFile } from "./IdbFile";

const requestFileSystem =
  window.requestFileSystem || (window as any).webkitRequestFileSystem;
export class IdbFileSystem extends AbstractFileSystem {
  private fs?: FileSystem;
  private rootDir: string;

  constructor(
    rootDir: string,
    private size: number,
    options?: FileSystemOptions
  ) {
    super(normalizePath(rootDir), options);
    this.rootDir = this.repository;
  }

  public async _getFS() {
    if (this.fs) {
      return this.fs;
    }
    if ((window as any).webkitStorageInfo) {
      await new Promise<void>((resolve, reject) => {
        const webkitStorageInfo = (window as any).webkitStorageInfo;
        webkitStorageInfo.requestQuota(
          window.PERSISTENT,
          this.size,
          () => resolve(),
          (e: any) =>
            reject(
              createError({
                name: QuotaExceededError.name,
                repository: this.repository,
                path: "",
                e,
              })
            )
        );
      });
    } else if ((navigator as any).webkitPersistentStorage) {
      await new Promise<void>((resolve, reject) => {
        const webkitPersistentStorage = (navigator as any)
          .webkitPersistentStorage;
        webkitPersistentStorage.requestQuota(
          this.size,
          () => resolve(),
          (e: any) =>
            reject(
              createError({
                name: QuotaExceededError.name,
                repository: this.repository,
                path: "",
                e,
              })
            )
        );
      });
    }
    const fs = await new Promise<FileSystem>((resolve, reject) => {
      requestFileSystem(
        window.PERSISTENT,
        this.size,
        (fs) => resolve(fs),
        (e) =>
          reject(
            createError({
              name: NotAllowedError.name,
              repository: this.repository,
              path: "",
              e,
            })
          )
      );
    });
    await new Promise<void>((resolve, reject) => {
      fs.root.getDirectory(
        this.repository,
        { create: true },
        () => resolve(),
        (e) =>
          reject(
            createError({
              repository: this.repository,
              path: "",
              e,
            })
          )
      );
    });
    this.fs = fs;
    return fs;
  }

  public async _head(path: string, _options: HeadOptions): Promise<Stats> {
    const entry = await this.getEntry(path);
    return new Promise<Stats>((resolve, reject) => {
      entry.getMetadata(
        (metadata) => {
          const modified = metadata.modificationTime.getTime();
          if (entry.isFile) {
            resolve({ modified, size: metadata.size });
          } else {
            resolve({ modified });
          }
        },
        (e) =>
          reject(
            createError({
              repository: this.repository,
              path,
              e,
            })
          )
      );
    });
  }

  public _patch(
    _path: string,
    _props: Props,
    _options: PatchOptions
  ): Promise<void> {
    throw new Error("Method not implemented.");
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
    const entry = await this.getEntry(path);
    return entry.toURL();
  }

  private async getEntry(path: string) {
    const fs = await this._getFS();
    return new Promise<FileEntry | DirectoryEntry>((resolve, reject) => {
      let rejected: any;
      const handle = (e: any) => {
        if (rejected) {
          reject(
            createError({
              repository: this.repository,
              path,
              e,
            })
          );
        }
        rejected = e;
      };
      const fullPath = joinPaths(this.rootDir, path);
      fs.root.getFile(fullPath, { create: false }, resolve, handle);
      fs.root.getDirectory(fullPath, { create: false }, resolve, handle);
    });
  }
}
