/** Creates private candidate secrets only. Never connects to a service. */
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const destination = process.argv[2];
if (!destination || !path.isAbsolute(destination)) throw new Error('Provide a fresh absolute private directory outside the checkout.');
const checkout = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const parent = await realpath(path.dirname(destination));
const privatePath = path.join(parent,path.basename(destination));
if (privatePath === checkout || privatePath.startsWith(checkout+path.sep)) throw new Error('Secrets cannot be stored in the repository.');
await mkdir(privatePath, {mode:0o700});
await writeFile(path.join(privatePath,'next-secrets.env'), `JWT_SECRET=${randomBytes(48).toString('hex')}\nDB_PASSWORD=${randomBytes(32).toString('hex')}\n`, {mode:0o600,flag:'wx'});
console.log('Private candidate secrets created. No service was modified.');
