require('dotenv').config({ quiet: true });
const bcrypt = require('bcrypt');
const db = require('../config/database');
async function main() {
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!name || !email || !password || password.length < 12) throw new Error('Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters).');
  const [existing] = await db.execute("SELECT user_id FROM users WHERE access_level = 'admin' LIMIT 1");
  if (existing.length) throw new Error('An administrator already exists. No changes made.');
  await db.execute('INSERT INTO users (user_name,user_email,user_password_hash,user_position,access_level) VALUES (?,?,?,?,?)',
    [name, email, await bcrypt.hash(password, 12), 'Manager', 'admin']);
  console.log('Administrator created. Remove the bootstrap variables from your environment.');
}
main().catch(error => { console.error(error.code ? `Administrator creation failed (${error.code}).` : error.message); process.exitCode = 1; })
  .finally(() => db.end());
