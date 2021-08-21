import { Converter, hasBlob, hasBuffer } from "univ-conv";

const c = new Converter();

describe("binary", () => {
  it("util/binary ArrayBuffer", async () => {
    const expected = "大谷翔平ホームラン";
    const ab = await c.toArrayBuffer({ value: expected, encoding: "Text" });

    {
      const actual = await c.toText(ab);
      expect(actual).toBe(expected);
    }

    {
      const u8 = await c.toUint8Array(ab);
      const actual = await c.toText(u8);
      expect(actual).toBe(expected);
    }

    if (hasBlob) {
      const blob = await c.toBlob(ab);
      const actual = await c.toText(blob);
      expect(actual).toBe(expected);
    }

    if (hasBuffer) {
      const buf = await c.toBuffer(ab);
      const actual = await c.toText(buf);
      expect(actual).toBe(expected);
    }

    {
      const base64 = await c.toBase64(ab);
      const actual = await c.toText({ value: base64, encoding: "Base64" });
      expect(actual).toBe(expected);
    }

    {
      const binaryString = await c.toBinaryString(ab);
      const actual = await c.toText({
        value: binaryString,
        encoding: "BinaryString",
      });
      expect(actual).toBe(expected);
    }
  });

  it("util/binary Uint8Array", async () => {
    const expected = "大谷翔平ホームラン";
    const u8 = await c.toUint8Array({ value: expected, encoding: "Text" });

    {
      const actual = await c.toText(u8);
      expect(actual).toBe(expected);
    }

    {
      const ab = await c.toArrayBuffer(u8);
      const actual = await c.toText(ab);
      expect(actual).toBe(expected);
    }

    if (hasBlob) {
      const blob = await c.toBlob(u8);
      const actual = await c.toText(blob);
      expect(actual).toBe(expected);
    }

    if (hasBuffer) {
      const buf = await c.toBuffer(u8);
      const actual = await c.toText(buf);
      expect(actual).toBe(expected);
    }

    {
      const base64 = await c.toBase64(u8);
      const actual = await c.toText({ value: base64, encoding: "Base64" });
      expect(actual).toBe(expected);
    }

    {
      const binaryString = await c.toBinaryString(u8);
      const actual = await c.toText({
        value: binaryString,
        encoding: "BinaryString",
      });
      expect(actual).toBe(expected);
    }
  });

  it("util/binary Buffer", async () => {
    if (!hasBuffer) {
      return;
    }

    const expected = "大谷翔平ホームラン";
    const buffer = await c.toBuffer({ value: expected, encoding: "Text" });

    {
      const actual = await c.toText(buffer);
      expect(actual).toBe(expected);
    }

    {
      const ab = await c.toArrayBuffer(buffer);
      const actual = await c.toText(ab);
      expect(actual).toBe(expected);
    }

    {
      const u8 = await c.toUint8Array(buffer);
      const actual = await c.toText(u8);
      expect(actual).toBe(expected);
    }

    if (hasBlob) {
      const blob = await c.toBlob(buffer);
      const actual = await c.toText(blob);
      expect(actual).toBe(expected);
    }

    {
      const base64 = await c.toBase64(buffer);
      const actual = await c.toText({ value: base64, encoding: "Base64" });
      expect(actual).toBe(expected);
    }

    {
      const binaryString = await c.toBinaryString(buffer);
      const actual = await c.toText({
        value: binaryString,
        encoding: "BinaryString",
      });
      expect(actual).toBe(expected);
    }
  });

  it("util/binary Blob", async () => {
    if (!hasBlob) {
      return;
    }

    const expected = "大谷翔平ホームラン";
    const blob = await c.toBlob({ value: expected, encoding: "Text" });

    {
      const actual = await c.toText(blob);
      expect(actual).toBe(expected);
    }

    {
      const ab = await c.toArrayBuffer(blob);
      const actual = await c.toText(ab);
      expect(actual).toBe(expected);
    }

    {
      const u8 = await c.toUint8Array(blob);
      const actual = await c.toText(u8);
      expect(actual).toBe(expected);
    }

    if (hasBuffer) {
      const buffer = await c.toBuffer(blob);
      const actual = await c.toText(buffer);
      expect(actual).toBe(expected);
    }

    {
      const base64 = await c.toBase64(blob);
      const actual = await c.toText({ value: base64, encoding: "Base64" });
      expect(actual).toBe(expected);
    }

    {
      const binaryString = await c.toBinaryString(blob);
      const actual = await c.toText({
        value: binaryString,
        encoding: "BinaryString",
      });
      expect(actual).toBe(expected);
    }
  });

  it("util/binary Base64", async () => {
    const expected = "大谷翔平ホームラン";
    const base64 = await c.toBase64({ value: expected, encoding: "Text" });

    {
      const actual = await c.toText({ value: base64, encoding: "Base64" });
      expect(actual).toBe(expected);
    }

    {
      const ab = await c.toArrayBuffer({ value: base64, encoding: "Base64" });
      const actual = await c.toText(ab);
      expect(actual).toBe(expected);
    }

    {
      const u8 = await c.toUint8Array({ value: base64, encoding: "Base64" });
      const actual = await c.toText(u8);
      expect(actual).toBe(expected);
    }

    if (hasBlob) {
      const blob = await c.toBlob({ value: base64, encoding: "Base64" });
      const actual = await c.toText(blob);
      expect(actual).toBe(expected);
    }

    if (hasBuffer) {
      const buf = await c.toBuffer({ value: base64, encoding: "Base64" });
      const actual = await c.toText(buf);
      expect(actual).toBe(expected);
    }

    {
      const binaryString = await c.toBinaryString({
        value: base64,
        encoding: "Base64",
      });
      const actual = await c.toText({
        value: binaryString,
        encoding: "BinaryString",
      });
      expect(actual).toBe(expected);
    }
  });

  it("util/binary BinaryString", async () => {
    const expected = "大谷翔平ホームラン";
    const binaryString = await c.toBinaryString({
      value: expected,
      encoding: "Text",
    });

    {
      const actual = await c.toText({
        value: binaryString,
        encoding: "BinaryString",
      });
      expect(actual).toBe(expected);
    }

    {
      const ab = await c.toArrayBuffer({
        value: binaryString,
        encoding: "BinaryString",
      });
      const actual = await c.toText(ab);
      expect(actual).toBe(expected);
    }

    {
      const u8 = await c.toUint8Array({
        value: binaryString,
        encoding: "BinaryString",
      });
      const actual = await c.toText(u8);
      expect(actual).toBe(expected);
    }

    if (hasBlob) {
      const blob = await c.toBlob({
        value: binaryString,
        encoding: "BinaryString",
      });
      const actual = await c.toText(blob);
      expect(actual).toBe(expected);
    }

    if (hasBuffer) {
      const buf = await c.toBuffer({
        value: binaryString,
        encoding: "BinaryString",
      });
      const actual = await c.toText(buf);
      expect(actual).toBe(expected);
    }

    {
      const base64 = await c.toBase64({
        value: binaryString,
        encoding: "BinaryString",
      });
      const actual = await c.toText({ value: base64, encoding: "Base64" });
      expect(actual).toBe(expected);
    }
  });
});
