import { NotFoundError } from "univ-fs";
import { IdbFileSystem } from "../IdbFileSystem";

export const fs = new IdbFileSystem("/isomorphic-fs-test");

export const setup = async () => {
  try {
    const root = await fs._getDirectory("/");
    await root.rm({ force: true, recursive: true, ignoreHook: true });
    await root.mkdir({ force: true, recursive: false, ignoreHook: true });
  } catch (e) {
    if (e.name !== NotFoundError.name) {
      throw e;
    }
  }
};
