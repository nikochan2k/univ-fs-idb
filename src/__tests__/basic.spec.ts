import { Converter } from "univ-conv";
import { NotFoundError, SeekOrigin } from "univ-fs";
import { IdbFileSystem } from "../IdbFileSystem";

const c = new Converter();

const fs = new IdbFileSystem("/isomorphic-fs-test", 50 * 1024 * 1024);

describe("basic", () => {
  beforeAll(async () => {
    const dir = await fs.getDirectory("/");
    const paths = await dir.readdir({ ignoreHook: true });
    for (const path of paths) {
      await fs.rm(path, { recursive: true, force: true, ignoreHook: true });
    }
  });

  it("rootdir", async () => {
    const dir = await fs.getDirectory("/");
    const paths = await dir.readdir();
    expect(paths.length).toBe(0);
  });

  it("add empty file", async () => {
    const file = await fs.getFile("/empty.txt");
    try {
      await file.stat();
      fail("Found file: " + file.path);
    } catch (e) {
      expect(e.name).toBe(NotFoundError.name);
    }
    const buffer = await c.toArrayBuffer({ value: "", encoding: "Text" });
    const ws = await file.createWriteStream();
    await ws.write(buffer);
    await ws.close();
    const stats = await file.stat();
    expect(stats.size).toBe(0);
  });

  it("add text file", async () => {
    const file = await fs.getFile("/test.txt");
    try {
      await file.stat();
      fail("Found file: " + file.path);
    } catch (e) {
      expect(e.name).toBe(NotFoundError.name);
    }
    const buffer = await c.toArrayBuffer({ value: "test", encoding: "Text" });
    const ws = await file.createWriteStream();
    await ws.write(buffer);
    await ws.close();
    const stats = await file.stat();
    expect(stats.size).toBe(4);
  });

  it("read text file", async () => {
    const file = await fs.getFile("/test.txt");
    const rs = await file.createReadStream();
    const blob = (await rs.read()) as Blob;
    expect(blob.size).toBe(4);
    const text = await c.toText(blob);
    expect(text).toBe("test");
  });

  it("continuous read and write", async () => {
    const file = await fs.getFile("/otani.txt");

    const ws = await file.createWriteStream();
    await ws.write(await c.toArrayBuffer({ value: "大谷", encoding: "Text" }));
    await ws.write(await c.toArrayBuffer({ value: "翔平", encoding: "Text" }));

    const rs = await file.createReadStream();
    let buffer = (await rs.read(6)) as Blob;
    let text = await c.toText(buffer);
    expect(text).toBe("大谷");

    await rs.seek(6, SeekOrigin.Begin);
    buffer = (await rs.read()) as Blob;
    text = await c.toText(buffer);
    expect(text).toBe("翔平");

    await ws.seek(0, SeekOrigin.End);
    await ws.write(await c.toBlob({ value: "ホームラン", encoding: "Text" }));

    await rs.seek(0, SeekOrigin.Begin);
    buffer = (await rs.read()) as Blob;
    text = await c.toText(buffer);
    expect(text).toBe("大谷翔平ホームラン");

    await rs.seek(0, SeekOrigin.Begin);
    await rs.read(6);
    await rs.seek(6, SeekOrigin.Current);
    buffer = (await rs.read()) as Blob;
    text = await c.toText(buffer);
    expect(text).toBe("ホームラン");

    await ws.close();
    await rs.close();
  });

  it("mkdir test", async () => {
    const dir = await fs.getDirectory("/");
    let dirs = await dir.readdir();
    expect(dirs.length).toBe(3);
    expect(0 <= dirs.indexOf("/empty.txt")).toBe(true);
    expect(0 <= dirs.indexOf("/test.txt")).toBe(true);
    expect(0 <= dirs.indexOf("/otani.txt")).toBe(true);

    const folder = await fs.getDirectory("/folder");
    try {
      await folder.stat();
      fail("Found folder: " + folder.path);
    } catch (e) {
      expect(e.name).toBe(NotFoundError.name);
    }
    await folder.mkdir();
    await folder.stat();

    dirs = await dir.readdir();
    expect(dirs.length).toBe(4);
    expect(0 <= dirs.indexOf("/empty.txt")).toBe(true);
    expect(0 <= dirs.indexOf("/test.txt")).toBe(true);
    expect(0 <= dirs.indexOf("/otani.txt")).toBe(true);
    expect(0 <= dirs.indexOf("/folder")).toBe(true);
  });

  it("create file in dir", async () => {
    const file = await fs.getFile("/folder/sample.txt");
    try {
      await file.stat();
      fail("Found file: " + file.path);
    } catch (e) {
      expect(e.name).toBe(NotFoundError.name);
    }
    const ws = await file.createWriteStream();
    const outBuf = await c.toArrayBuffer({ value: "Sample", encoding: "Text" });
    const before = Date.now();
    await ws.write(outBuf);
    await ws.close();

    const after = Date.now() + 1;
    const stats = await file.stat();
    const modified = stats.modified ?? 0;
    expect(before <= modified && modified <= after).toBe(true);

    const rs = await file.createReadStream();
    const inBuf = (await rs.read()) as Blob;
    const text = await c.toText(inBuf);
    expect(text).toBe("Sample");
    rs.close();

    const dir = await fs.getDirectory("/folder/");
    const list = await dir.list();
    expect(0 <= list.indexOf("/folder/sample.txt")).toBe(true);
  });

  it("copy directory", async () => {
    const from = await fs.getDirectory("/folder");
    const to = await fs.getDirectory("/folder2");
    const errors = await from.copy(to, { force: false, recursive: true });
    expect(errors.length).toBe(0);
    const stats = await to.stat();
    expect(stats.size).toBeUndefined();
    const root = await fs.getDirectory("/");
    const list = await root.ls();
    expect(0 <= list.indexOf("/folder2")).toBe(true);
    const toList = await to.ls();
    expect(0 <= toList.indexOf("/folder2/sample.txt")).toBe(true);
  });

  it("move file", async () => {
    await fs.move("/folder2/sample.txt", "/folder2/sample2.txt");
    const list = await fs.list("/folder2");
    expect(list.indexOf("/folder2/sample.txt") < 0).toBe(true);
    expect(0 <= list.indexOf("/folder2/sample2.txt")).toBe(true);
  });

  it("move directory", async () => {
    const errors = await fs.move("/folder2", "/folder3");
    expect(errors.length).toBe(0);
    const root = await fs.getDirectory("/");
    const list = await root.ls();
    expect(list.indexOf("/folder2") < 0).toBe(true);
    expect(0 <= list.indexOf("/folder3")).toBe(true);
    const folder3 = await fs.getDirectory("/folder3");
    const folder3List = await folder3.ls();
    expect(0 <= folder3List.indexOf("/folder3/sample2.txt")).toBe(true);
  });
});
