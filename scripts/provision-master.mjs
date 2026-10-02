// Run once locally. The password goes only to a private artifact outside the repo.
// stdout is a provisioning SQL statement containing only a salted password hash.
import { randomBytes, randomUUID, pbkdf2Sync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(32).toString('hex');
const hash = pbkdf2Sync(password, salt, 600000, 32, 'sha256').toString('hex');
const employerId = randomUUID();
const artifact = '/Users/dylanontra/Documents/Hire From SA master login.txt';
writeFileSync(artifact, `Hire From SA private master login\n\nSign in: https://www.hirefromsa.com/employer-login.html\nUsername: master\nPassword: ${password}\n\nAccess: Employer job posting, hiring inbox, talent search, candidate approvals and resume index.\nNo email is attached. Sessions expire after 8 hours. There is no email password recovery.\nStore this password in your password manager. Do not share this file publicly.\n`, { mode: 0o600, flag: 'wx' });
console.log(`begin; insert into public.hirer_workspaces (id, edit_token_hash, company_name) values ('${employerId}', '${randomBytes(32).toString('hex')}', 'Hire From SA'); insert into public.master_accounts (username,password_hash,password_salt,employer_id,can_review) values ('master','${hash}','${salt}','${employerId}',true); commit;`);
