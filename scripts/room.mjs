// Housekeeping for the master scene, bake-assets/master/room.blend (or $ROOM_BLEND).
//
//   npm run room:backup                    copy it to the NFS share as room-<date-time>.blend
//   npm run room:backup -- --list          list the backups there
//   npm run room:backup -- --restore <name>    copy a backup back over the local master
//   npm run room:check                     look for objects that pass through each other
//                                          (new since the reviewed baseline; exits 1 if any)
//   npm run room:check -- --write-baseline accept the current intersections as the baseline
//
// Where backups go is local, not in the repo: bake-assets/backup.json (git-ignored), e.g.
//   { "host": "user@nas", "jump": "user@bastion", "dir": "/srv/backups/room" }
// ("jump" is optional: an SSH jump host). $ROOM_BACKUP_HOST / _JUMP / _DIR override it.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const blend = resolve(process.env.ROOM_BLEND ?? join(root, 'bake-assets', 'master', 'room.blend'));
const [cmd, ...args] = process.argv.slice(2);
let cfg = {};
try {
  cfg = JSON.parse(readFileSync(join(root, 'bake-assets', 'backup.json'), 'utf8'));
} catch {}
const host = process.env.ROOM_BACKUP_HOST ?? cfg.host;
const jump = process.env.ROOM_BACKUP_JUMP ?? cfg.jump;
const dir = process.env.ROOM_BACKUP_DIR ?? cfg.dir;
const viaJump = jump ? ['-J', jump] : [];
if (cmd === 'backup' && (!host || !dir)) {
  console.error('No backup target: create bake-assets/backup.json ({ "host", "jump"?, "dir" }) or set ROOM_BACKUP_HOST and ROOM_BACKUP_DIR.');
  process.exit(1);
}

function run(exe, argv) {
  const r = spawnSync(exe, argv, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function stampNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

if (cmd === 'backup') {
  if (args[0] === '--list') {
    run('ssh', [...viaJump, host, `ls -lh ${dir}`]);
  } else if (args[0] === '--restore') {
    const name = args[1];
    if (!name || !/^[\w.-]+\.blend$/.test(name)) {
      console.error('Usage: npm run room:backup -- --restore room-<date-time>.blend');
      process.exit(2);
    }
    run('scp', [...viaJump, `${host}:${dir}/${name}`, blend]);
    console.log(`Restored ${name} -> ${blend}`);
  } else {
    if (!existsSync(blend)) {
      console.error(`No master at ${blend}`);
      process.exit(1);
    }
    const name = `room-${stampNow()}.blend`;
    console.log(`Backing up ${blend} (${(statSync(blend).size / 2 ** 30).toFixed(2)} GB) -> ${host}:${dir}/${name}`);
    run('ssh', [...viaJump, host, `mkdir -p ${dir}`]);
    run('scp', [...viaJump, blend, `${host}:${dir}/${name}`]);
    console.log('Done.');
  }
} else if (cmd === 'check') {
  const blender = [process.env.BLENDER, 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe'].filter(Boolean).find((p) => existsSync(p));
  if (!blender) {
    console.error('Blender not found; set BLENDER.');
    process.exit(1);
  }
  const base = join(root, 'scripts', 'blender', 'clip-baseline.json');
  const r = spawnSync(blender, ['-b', blend, '--factory-startup', '--python', join(root, 'scripts', 'blender', 'check_clips.py'), '--', '--baseline', base, ...args], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
} else {
  console.error('Usage: node scripts/room.mjs backup [--list | --restore <name>] | check [--write-baseline]');
  process.exit(2);
}
