import {
  AbstractReadStream,
  OpenReadOptions,
  Source,
  SourceType,
} from "univ-fs";
import { IdbFile } from "./IdbFile";
import { isBlob } from "univ-conv";

export class IdbReadStream extends AbstractReadStream {
  constructor(private idbFile: IdbFile, options: OpenReadOptions) {
    super(idbFile, options);
  }

  public async _close(): Promise<void> {}

  public async _read(size?: number): Promise<Source | null> {
    const buffer = await this.idbFile._load(this.converter);
    const length = buffer.size;
    if (length <= this.position) {
      return null;
    }
    let end = this.position + (size == null ? this.bufferSize : size);
    if (length < end) {
      end = length;
    }
    return buffer.slice(this.position, end);
  }

  protected async _seek(_start: number): Promise<void> {}

  protected getDefaultSourceType(): SourceType {
    return "Blob";
  }
}
