import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({});
const BUCKET = process.env.DOCS_BUCKET!;

// Tool: read a document from the docs bucket. Input contract: { key: "..." }.
export async function handler(event: any) {
  const body = event?.body ? JSON.parse(event.body) : event;
  const key = body?.key;
  if (!key) {
    throw new Error('missing "key"');
  }

  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const text = await res.Body!.transformToString();

  return {
    key,
    size: res.ContentLength,
    preview: text.slice(0, 2000),
  };
}
