import { config } from 'dotenv';
config({ path: '.env', override: true });

const { db } = await import('../src/lib/db');

async function main() {
  // 1. Check if _OperatorSchools already exists (read-only)
  const existing = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name::text FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_OperatorSchools'
  `;

  if (existing.length > 0) {
    console.log('Tabela _OperatorSchools já existe. Nada a fazer.');
    const count = await db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "_OperatorSchools"
    `;
    console.log(`Linhas atuais: ${count[0].count}`);
    return;
  }

  // 2. Confirm id column types for users and schools
  const userIdType = await db.$queryRaw<{ data_type: string }[]>`
    SELECT data_type::text FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='id'
  `;
  const schoolIdType = await db.$queryRaw<{ data_type: string }[]>`
    SELECT data_type::text FROM information_schema.columns
    WHERE table_schema='public' AND table_name='schools' AND column_name='id'
  `;
  console.log('users.id type:', userIdType[0]?.data_type);
  console.log('schools.id type:', schoolIdType[0]?.data_type);

  // 3. Create the implicit M2M join table that Prisma expects for the
  //    "OperatorSchools" relation between User (model A) and School (model B).
  //    Prisma implicit join table convention:
  //      - table name: _<RelationName>  -> _OperatorSchools
  //      - column "A" -> first model (User), references users(id)
  //      - column "B" -> second model (School), references schools(id)
  console.log('\nCriando tabela _OperatorSchools...');

  await db.$executeRaw`CREATE TABLE "_OperatorSchools" ("A" TEXT NOT NULL, "B" TEXT NOT NULL)`;
  console.log('  ✓ CREATE TABLE');

  await db.$executeRaw`CREATE UNIQUE INDEX "_OperatorSchools_AB_unique" ON "_OperatorSchools"("A", "B")`;
  console.log('  ✓ UNIQUE INDEX (A, B)');

  await db.$executeRaw`CREATE INDEX "_OperatorSchools_B_index" ON "_OperatorSchools"("B")`;
  console.log('  ✓ INDEX (B)');

  await db.$executeRaw`ALTER TABLE "_OperatorSchools" ADD CONSTRAINT "_OperatorSchools_A_fkey" FOREIGN KEY ("A") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`;
  console.log('  ✓ FK A -> users(id)');

  await db.$executeRaw`ALTER TABLE "_OperatorSchools" ADD CONSTRAINT "_OperatorSchools_B_fkey" FOREIGN KEY ("B") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE`;
  console.log('  ✓ FK B -> schools(id)');

  // 4. Verify
  const verify = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name::text FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_OperatorSchools'
  `;
  console.log('\n✓ Tabela criada com sucesso:', verify.length > 0);

  // 5. Read-only test: load Emanuel's assigned schools via Prisma relation
  const emanuel = await db.user.findFirst({
    where: { email: { contains: 'emanuel', mode: 'insensitive' } },
    include: { assigned_schools: { select: { id: true, name: true } } },
  });
  console.log(
    'Teste de leitura da relação para Emanuel:',
    JSON.stringify(
      { name: emanuel?.full_name, assigned: emanuel?.assigned_schools ?? [] },
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('ERRO:', e);
    process.exit(1);
  });
