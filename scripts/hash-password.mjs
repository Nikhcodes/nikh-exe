// Creates the value for the ADMIN_PASSWORD_HASH environment variable.
//   npm run hash-password
// Type your password (it is not shown), press Enter, copy the line that starts with "scrypt:".
import { createInterface } from 'node:readline';
import { hashPassword } from '../api/_lib/auth.js';

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let muted = false;
rl._writeToOutput = s => { if (!muted) rl.output.write(s); };

function ask(q) {
  return new Promise(resolve => {
    muted = false; rl.output.write(q); muted = true;
    rl.question('', a => { muted = false; rl.output.write('\n'); resolve(a); });
  });
}

const pw = await ask('New admin password (min 12 characters): ');
if (pw.length < 12) { console.error('Too short. Use at least 12 characters.'); process.exit(1); }
const again = await ask('Type it again: ');
rl.close();
if (pw !== again) { console.error('The two passwords do not match.'); process.exit(1); }
console.log('\nADMIN_PASSWORD_HASH value (copy the whole line):\n');
console.log(hashPassword(pw));
