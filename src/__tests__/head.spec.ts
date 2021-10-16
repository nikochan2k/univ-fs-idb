import { NotFoundError } from "univ-fs";
import { IdbFileSystem } from "../IdbFileSystem";

const fs = new IdbFileSystem("/isomorphic-fs-test");

describe("head", () => {
  beforeAll(async () => {
    const dir = await fs.getDirectory("/");
    const paths = await dir.readdir({ ignoreHook: true });
    for (const path of paths) {
      await fs.rm(path, { recursive: true, force: true, ignoreHook: true });
    }
  });

  it("rootdir", async () => {
    const stat = await fs.head("/");
    expect(stat.size).toBeUndefined();
  });

  it("nothing", async () => {
    try {
      await fs.stat("/nothing");
      fail("/nothing exists");
    } catch (e) {
      expect(e.name).toBe(NotFoundError.name);
    }
  });

  it("file_head", async () => {
    await fs.writeAll("/file_head", new ArrayBuffer(1));
    const stat = await fs.stat("/file_head");
    expect(stat.size).toBe(1);
  });
});
