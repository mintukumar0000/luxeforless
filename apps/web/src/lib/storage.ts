import fs from "fs/promises";
import path from "path";

const STORAGE_ROOT = process.env.STORAGE_PATH || path.join(process.cwd(), "../../storage");

export async function ensureStorageDir(subdir: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subdir);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function saveFile(subdir: string, filename: string, data: Buffer): Promise<string> {
  const dir = await ensureStorageDir(subdir);
  await fs.writeFile(path.join(dir, filename), data);
  return `/api/storage/${subdir}/${filename}`;
}

export async function readFile(subdir: string, filename: string): Promise<Buffer> {
  return fs.readFile(path.join(STORAGE_ROOT, subdir, filename));
}
