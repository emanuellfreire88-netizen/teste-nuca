import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

async function main() {
  console.log('Seeding database...');

  const existingAdmin = await db.user.findUnique({
    where: { email: 'admin@nuca.com' },
  });

  if (existingAdmin) {
    console.log('Admin user already exists, skipping...');
    return;
  }

  // Use bcrypt salt rounds of 12 for stronger hashing
  const hashedPassword = await bcrypt.hash('Admin@123', 12);

  const admin = await db.user.create({
    data: {
      full_name: 'Administrador',
      email: 'admin@nuca.com',
      password: hashedPassword,
      role: 'Admin',
      status: 'active',
    },
  });

  console.log('Admin user created:', {
    id: admin.id,
    email: admin.email,
    role: admin.role,
  });

  console.log('Seeding complete!');
  console.log('⚠️  IMPORTANT: Change the default admin password after first login!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  });
