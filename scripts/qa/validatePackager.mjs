/** Validate the pinned packager's real schema without compiling any OS binaries. */
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateConfiguration}=require('app-builder-lib/out/util/config/config');
await validateConfiguration(require('../../package.json').build);
console.log('PASS: pinned electron-builder configuration schema.');
