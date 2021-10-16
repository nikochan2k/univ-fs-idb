import { AbstractWriteStream, OpenWriteOptions, Source } from "univ-fs";
import { IdbFile } from "./IdbFile";
export class IdbWriteStream extends AbstractWriteStream {
  constructor(private idbFile: IdbFile, options: OpenWriteOptions) {
    super(idbFile, options);
  }

  public async _close(): Promise<void> {
    delete this.idbFile.buffer;
  }

  public async _truncate(size: number): Promise<void> {
    let buffer = await this.idbFile._load(this.converter);
    let length = buffer.size;
    if (length < size) {
      size = length;
    }
    buffer = buffer.slice(0, size);
    await this.idbFile._save(this.converter, buffer);
  }

  public async _write(value: Source): Promise<number> {
    const blob = await this.converter.toBlob(value);
    const buffer = this.idbFile.buffer as Blob;
    const head = buffer.slice(0, this.position);
    const tail = buffer.slice(this.position + blob.size);
    let padding = this.position - head.size;
    if (padding < 0) {
      padding = 0;
    }

    const newBlob = new Blob([head, new Uint8Array(padding), blob, tail]);
    return this.idbFile._save(this.converter, newBlob);
  }

  protected async _seek(_start: number): Promise<void> {}
}
