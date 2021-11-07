import { IdbFileSystem } from "..";

export const fs = new IdbFileSystem("/isomorphic-fs-test");

export const setup = async () => {
  const dir = await fs.getDirectory("/");
  const paths = await dir.readdir({ ignoreHook: true });
  for (const path of paths) {
    await fs.rm(path, { recursive: true, force: true, ignoreHook: true });
  }
};
