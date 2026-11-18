/**
 * Crée la base MySQL de GAMA-Copilot si elle n'existe pas encore (npm run db:create).
 * Les identifiants viennent de .env (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME).
 */
import 'dotenv/config';
import { createConnection } from 'mysql2/promise';

async function main() {
  const database = process.env.DB_NAME;
  if (!database || !/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(
      'DB_NAME manquant ou invalide (lettres, chiffres et _ uniquement).',
    );
  }
  const connection = await createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
  });
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    console.log(`Base « ${database} » prête.`);
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
