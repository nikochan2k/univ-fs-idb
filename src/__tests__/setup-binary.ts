import {
  ErrorLike,
  NotFoundError,
  OnExists,
  OnNoParent,
  OnNotExist,
} from "univ-fs";
import { IdbFileSystem } from "../IdbFileSystem";

export const fs = new IdbFileSystem("/isomorphic-fs-test", {
  storeType: "binary",
});

export const setup = async () => {
  try {
    const root = await fs.getDirectory("/");
    await root.rm({
      onNotExist: OnNotExist.Ignore,
      recursive: true,
      ignoreHook: true,
    });
    await root.mkdir({
      onExists: OnExists.Ignore,
      onNoParent: OnNoParent.MakeParents,
      ignoreHook: true,
    });
  } catch (e) {
    if ((e as ErrorLike).name !== NotFoundError.name) {
      throw e;
    }
  }
};
