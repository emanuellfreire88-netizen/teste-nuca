import { config } from 'dotenv';
config({ path: '.env', override: true });

const { db } = await import('../src/lib/db');
const { hashPassword, comparePassword } = await import('../src/lib/auth');

const TEMP_PASSWORD = 'Nuca@2026';

async function main() {
  // Find Emanuel (match by name or email containing "emanuel")
  const emanuel = await db.user.findFirst({
    where: {
      OR: [
        { email: { contains: 'emanuel', mode: 'insensitive' } },
        { full_name: { contains: 'emanuel', mode: 'insensitive' } },
      ],
    },
  });

  if (!emanuel) {
    console.error('Usuário Emanuel não encontrado.');
    process.exit(1);
  }

  console.log('Usuário encontrado:');
  console.log(`  ID:    ${emanuel.id}`);
  console.log(`  Nome:  ${emanuel.full_name}`);
  console.log(`  Email: ${emanuel.email}`);
  console.log(`  Role:  ${emanuel.role}`);

  // Hash the new temp password with the same method the app uses (cost 12)
  const newHash = await hashPassword(TEMP_PASSWORD);

  // Verify the hash works before saving
  const verifies = await comparePassword(TEMP_PASSWORD, newHash);
  if (!verifies) {
    console.error('ERRO: hash gerado não verifica a senha. Abortando.');
    process.exit(1);
  }

  // Update password + force change on next login + clear lock counters
  const updated = await db.user.update({
    where: { id: emanuel.id },
    data: {
      password: newHash,
      must_change_password: true,
      failed_login_attempts: 0,
      locked_until: null,
    },
  });

  console.log('\nSenha alterada com sucesso:');
  console.log(`  Usuario:    ${updated.full_name} <${updated.email}>`);
  console.log(`  Nova senha: ${TEMP_PASSWORD}`);
  console.log(`  must_change_password: ${updated.must_change_password}`);
  console.log(`  failed_login_attempts: ${updated.failed_login_attempts}`);

  // Final verification: read back from DB and compare
  const reloaded = await db.user.findUnique({
    where: { id: emanuel.id },
    select: { password: true, must_change_password: true },
  });
  const finalCheck = await comparePassword(TEMP_PASSWORD, reloaded!.password);
  console.log(`\nVerificação final (senha confere no banco): ${finalCheck ? 'OK' : 'FALHOU'}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
