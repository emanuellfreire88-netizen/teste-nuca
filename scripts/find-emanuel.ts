import { config } from 'dotenv';
config({ path: '.env', override: true });

console.log('DATABASE_URL prefix:', process.env.DATABASE_URL?.slice(0, 40) + '...');

const { db } = await import('../src/lib/db');

async function main() {
  const users = await db.user.findMany({
    select: {
      id: true,
      full_name: true,
      email: true,
      role: true,
      status: true,
      must_change_password: true,
      failed_login_attempts: true,
      locked_until: true,
    },
  });
  console.log(JSON.stringify(users, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
