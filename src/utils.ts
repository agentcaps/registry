import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function sha256(input: string | Buffer): string {
  return `sha256:${createHash('sha256').update(input).digest('hex')}`;
}

export function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return slug || 'root';
}

export function urnSegment(input: string): string {
  return slugify(input).replace(/\./g, '.');
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, content, 'utf8');
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

export async function removeDir(path: string): Promise<void> {
  if (existsSync(path)) {
    await rm(path, { recursive: true, force: true });
  }
}

export async function runGit(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

export function parseGitHubRepoUrl(url: string): { owner: string; repo: string } | undefined {
  const normalized = url.replace(/\.git$/, '');
  const match = normalized.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:[/#?].*)?$/);
  if (!match) return undefined;
  return { owner: match[1], repo: match[2] };
}

export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname || 'local';
  } catch {
    return 'local';
  }
}

export function repoNameFromUrl(url: string): string {
  const github = parseGitHubRepoUrl(url);
  if (github) return github.repo;
  const cleaned = url.replace(/\.git$/, '').replace(/\/$/, '');
  return cleaned.split('/').pop() || 'repository';
}

export function fileUrl(path: string): string {
  return pathToFileURL(path).toString();
}
