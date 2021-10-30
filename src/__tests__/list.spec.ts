import { testAll } from "univ-fs/lib/__tests__/list";
import { IdbFileSystem } from "../IdbFileSystem";

const fs = new IdbFileSystem("/isomorphic-fs-test");
testAll(fs, async () => {
  const dir = await fs.getDirectory("/");
  const paths = await dir.readdir({ ignoreHook: true });
  for (const path of paths) {
    await fs.rm(path, { recursive: true, force: true, ignoreHook: true });
  }
});
