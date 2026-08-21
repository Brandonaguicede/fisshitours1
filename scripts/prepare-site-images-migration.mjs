import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const dryRun = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'site-images';
const ALLOWED = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

if (!dryRun && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or run with --dry-run.');
}

const supabase = dryRun ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  const files = await listImages(publicDir);
  const plan = [];

  for (const file of files) {
    const relative = path.relative(publicDir, file).replaceAll(path.sep, '/');
    const ext = path.extname(file).toLowerCase();
    const mime = ALLOWED.get(ext);
    if (!mime) continue;

    const folder = folderFor(relative);
    const hash = await sha256(file);
    const storagePath = `${folder}/legacy/${hash.slice(0, 16)}${ext === '.jpeg' ? '.jpg' : ext}`;
    const stat = await fs.stat(file);
    const item = { localPath: `public/${relative}`, storagePath, mime, sizeBytes: stat.size };

    if (!dryRun && supabase) {
      const exists = await supabase.storage.from(BUCKET).list(path.dirname(storagePath), { search: path.basename(storagePath), limit: 1 });
      if (exists.error) throw exists.error;
      if (!exists.data?.some((entry) => entry.name === path.basename(storagePath))) {
        const data = await fs.readFile(file);
        const upload = await supabase.storage.from(BUCKET).upload(storagePath, data, {
          contentType: mime,
          cacheControl: '31536000',
          upsert: false,
        });
        if (upload.error) throw upload.error;
      }
    }

    plan.push(item);
  }

  await fs.mkdir(path.join(rootDir, 'tmp'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'tmp', 'site-images-migration-plan.json'), JSON.stringify(plan, null, 2));
  console.log(`Prepared ${plan.length} image mappings.`);
  if (dryRun) console.log('Dry run only. No remote uploads were performed.');
}

async function listImages(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await listImages(full));
    } else if (ALLOWED.has(path.extname(entry.name).toLowerCase())) {
      result.push(full);
    }
  }
  return result;
}

function folderFor(relative) {
  const first = relative.split('/')[0]?.toLowerCase();
  if (first === 'botes') return 'boats';
  if (first === 'galeria') return 'gallery';
  if (first === 'destinations') return 'destinations';
  if (first === 'tours') return 'tours';
  return 'general';
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
