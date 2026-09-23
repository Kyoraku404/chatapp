import { Readable } from "node:stream";

type ObjectInput = { Bucket: string; Key: string };

export class PutObjectCommand {
  readonly kind = "put";
  constructor(public input: ObjectInput & { Body: Uint8Array; ContentType: string }) {}
}
export class GetObjectCommand {
  readonly kind = "get";
  constructor(public input: ObjectInput & { Range?: string }) {}
}
export class DeleteObjectCommand {
  readonly kind = "delete";
  constructor(public input: ObjectInput) {}
}

interface GetObjectOutput {
  Body: Readable | null;
  ContentRange?: string;
  ContentLength?: number;
}

class R2Client {
  constructor(private url: string, private secret: string, private bucket: string) {}

  async send(command: PutObjectCommand): Promise<void>;
  async send(command: DeleteObjectCommand): Promise<void>;
  async send(command: GetObjectCommand): Promise<GetObjectOutput>;
  async send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand): Promise<void | GetObjectOutput> {
    if (command.input.Bucket !== this.bucket) throw new Error("R2 bucket mismatch.");
    const method = command instanceof PutObjectCommand ? "PUT" : command instanceof GetObjectCommand ? "GET" : "DELETE";
    const response = await fetch(this.url, {
      method,
      headers: {
        Authorization: `Bearer ${this.secret}`,
        "x-r2-key": command.input.Key,
        ...(command instanceof PutObjectCommand ? { "Content-Type": command.input.ContentType } : {}),
        ...(command instanceof GetObjectCommand && command.input.Range ? { Range: command.input.Range } : {}),
      },
      ...(command instanceof PutObjectCommand ? { body: command.input.Body as unknown as BodyInit } : {}),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`R2 request failed (${response.status}).`);
    if (command instanceof GetObjectCommand) {
      return {
        Body: response.body ? Readable.fromWeb(response.body as never) : null,
        ContentRange: response.headers.get("content-range") ?? undefined,
        ContentLength: Number(response.headers.get("content-length")) || undefined,
      };
    }
  }
}

let client: R2Client | null = null;
export function r2Config() {
  const url = process.env.R2_WORKER_URL;
  const secret = process.env.R2_WORKER_SECRET;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!url || !secret || !bucket) return null;
  client ??= new R2Client(url, secret, bucket);
  return { client, bucket };
}
