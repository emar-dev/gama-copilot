import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePasswordResetTokens1763395200000 implements MigrationInterface {
  name = 'CreatePasswordResetTokens1763395200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`password_reset_tokens\` (
        \`id\` varchar(36) NOT NULL,
        \`user_id\` varchar(36) NOT NULL,
        \`token_hash\` char(64) NOT NULL,
        \`expires_at\` datetime(6) NOT NULL,
        \`used_at\` datetime(6) NULL,
        \`requested_ip\` varchar(45) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_password_reset_tokens_user_id\` (\`user_id\`),
        UNIQUE INDEX \`UQ_password_reset_tokens_token_hash\` (\`token_hash\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_password_reset_tokens_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `password_reset_tokens`');
  }
}
