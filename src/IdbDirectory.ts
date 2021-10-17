import { AbstractDirectory, TypeMismatchError } from "univ-fs";
import { ENTRY_STORE, IdbFileSystem } from "./IdbFileSystem";

const DIR_OPEN_BOUND = String.fromCharCode("/".charCodeAt(0) + 1);

function countSlash(path: string) {
  let result = 0;
  for (let i = 0, end = path.length; i < end; i++) {
    if (path[i] === "/") {
      result++;
    }
  }
  return result;
}

function getRange(fullPath: string) {
  if (fullPath === "/") {
    return IDBKeyRange.bound("/", DIR_OPEN_BOUND, false, true);
  } else {
    return IDBKeyRange.bound(
      fullPath + "/",
      fullPath + DIR_OPEN_BOUND,
      false,
      true
    );
  }
}
export class IdbDirectory extends AbstractDirectory {
  constructor(private idbFS: IdbFileSystem, path: string) {
    super(idbFS, path);
  }

  public async _list(): Promise<string[]> {
    const path = this.path;
    const idbFS = this.idbFS;
    const stats = await idbFS._getEntry(path);
    if (stats.size) {
      throw idbFS.error(path, undefined, TypeMismatchError.name);
    }
    const db = await idbFS._open();
    return new Promise<string[]>((resolve, reject) => {
      const paths: string[] = [];
      const entryStore = idbFS._getObjectStore(
        db,
        ENTRY_STORE,
        "readonly",
        () => resolve(paths),
        (ev) => idbFS._onReadError(reject, path, ev),
        (ev) => idbFS._onAbort(reject, path, ev)
      );

      let slashCount: number;
      if (path === "/") {
        slashCount = 1;
      } else {
        slashCount = countSlash("/") + 1; // + 1 is the last slash for directory
      }
      const range = getRange(path);
      const request = entryStore.openCursor(range);
      request.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result as IDBCursorWithValue;
        if (cursor) {
          const key = cursor.key.toString();
          if (
            path !== key && // remove root dir
            slashCount === countSlash(key)
          ) {
            paths.push(key);
          }
          cursor.continue();
        }
      };
      request.onerror = (ev) => idbFS._onReadError(reject, path, ev);
    });
  }

  public async _mkcol(): Promise<void> {
    const now = Date.now();
    await this.idbFS._putEntry(this.path, {
      created: now,
      modified: now,
    });
  }

  public async _rmdir(): Promise<void> {
    await this.idbFS._rm(this.path);
  }
}
