import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOAuthAccounts1763409600000 implements MigrationInterface {
  name = 'AddOAuthAccounts1763409600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Un compte créé via Google ou GitHub n'a pas (encore) de mot de passe.
    await queryRunner.query(
      'ALTER TABLE `users` MODIFY `password_hash` varchar(100) NULL',
    );
    await queryRunner.query(
      `CREATE TABLE \`oauth_accounts\` (
        \`id\` varchar(36) NOT NULL,
        \`user_id\` varchar(36) NOT NULL,
        \`provider\` varchar(20) NOT NULL,
        \`provider_user_id\` varchar(255) NOT NULL,
        \`email\` varchar(254) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_oauth_accounts_user_id\` (\`user_id\`),
        UNIQUE INDEX \`UQ_oauth_accounts_provider_user\` (\`provider\`, \`provider_user_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_oauth_accounts_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `oauth_accounts`');
    // Échoue si des comptes sans mot de passe existent : à traiter avant de revenir en arrière.
    await queryRunner.query(
      'ALTER TABLE `users` MODIFY `password_hash` varchar(100) NOT NULL',
    );
  }
}
