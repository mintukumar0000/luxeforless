import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const STORAGE_ROOT = process.env.STORAGE_PATH || path.join(process.cwd(), "../../storage");

function publicUrlForKey(key: string): string {
  if (process.env.STORAGE_PUBLIC_BASE_URL) {
    return `${process.env.STORAGE_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
  const parts = key.split("/");
  if (parts.length >= 2) {
    return `/api/storage/${parts[0]}/${parts.slice(1).join("/")}`;
  }
  return `/api/storage/${key}`;
}

async function saveToS3(key: string, data: Buffer, contentType: string): Promise<string> {
  const bucket = process.env.S3_BUCKET!;
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "auto";
  const accessKey = process.env.S3_ACCESS_KEY_ID!;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY!;

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: Boolean(endpoint),
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    })
  );

  return publicUrlForKey(key);
}

export async function ensureStorageDir(subdir: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subdir);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function saveFile(subdir: string, filename: string, data: Buffer): Promise<string> {
  const key = `${subdir}/${filename}`;
  if (process.env.S3_BUCKET) {
    const ext = filename.split(".").pop()?.toLowerCase();
    const mime =
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
    return saveToS3(key, data, mime);
  }
  const dir = await ensureStorageDir(subdir);
  await fs.writeFile(path.join(dir, filename), data);
  return publicUrlForKey(key);
}

export async function saveDataUrl(subdir: string, dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  const ext = match[1].includes("jpeg") ? "jpg" : match[1].includes("webp") ? "webp" : "png";
  const buffer = Buffer.from(match[2], "base64");
  return saveFile(subdir, `${randomUUID()}.${ext}`, buffer);
}

export async function readFile(subdir: string, filename: string): Promise<Buffer> {
  return fs.readFile(path.join(STORAGE_ROOT, subdir, filename));
}
