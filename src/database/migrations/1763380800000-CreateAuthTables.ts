import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthTables1763380800000 implements MigrationInterface {
  name = 'CreateAuthTables1763380800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`users\` (
        \`id\` varchar(36) NOT NULL,
        \`email\` varchar(254) NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`password_hash\` varchar(100) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`UQ_users_email\` (\`email\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await queryRunner.query(
      `CREATE TABLE \`sessions\` (
        \`id\` varchar(36) NOT NULL,
        \`user_id\` varchar(36) NOT NULL,
        \`refresh_token_hash\` char(64) NOT NULL,
        \`remember\` tinyint NOT NULL DEFAULT 0,
        \`user_agent\` varchar(255) NULL,
        \`ip\` varchar(45) NULL,
        \`expires_at\` datetime(6) NOT NULL,
        \`revoked_at\` datetime(6) NULL,
        \`last_used_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_sessions_user_id\` (\`user_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_sessions_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `sessions`');
    await queryRunner.query('DROP TABLE `users`');
  }
}
