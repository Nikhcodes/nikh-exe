// Database access. Production uses Neon's serverless HTTP driver (same as before).
// A local Postgres (DATABASE_URL pointing at localhost) uses the plain `pg` driver,
// so the whole site can be run and tested offline.
import { neon } from '@neondatabase/serverless';

let runner;

async function getRunner() {
  if (runner) return runner;
  const url = process.env.DATABASE_URL;
  if (!url) throw Object.assign(new Error('DATABASE_URL is not set'), { code: 'NO_DB' });
  const host = new URL(url).hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url, max: 4 });
    runner = (text, params) => pool.query(text, params).then(r => r.rows);
  } else {
    const n = neon(url);
    runner = (text, params) => n(text, params);
  }
  return runner;
}

/** Plain parameterised query: q('SELECT ... WHERE id = $1', [id]) */
export async function q(text, params = []) {
  return (await getRunner())(text, params);
}

/** Tagged template: sql`SELECT ... WHERE id = ${id}` (values are always parameters, never spliced). */
export async function sql(strings, ...values) {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) text += '$' + (i + 1) + strings[i + 1];
  return q(text, values);
}
