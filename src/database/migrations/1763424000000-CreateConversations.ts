import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateConversations1763424000000 implements MigrationInterface {
  name = 'CreateConversations1763424000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`conversations\` (
        \`id\` varchar(36) NOT NULL,
        \`user_id\` varchar(36) NOT NULL,
        \`title\` varchar(200) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_conversations_user_updated\` (\`user_id\`, \`updated_at\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_conversations_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await queryRunner.query(
      `CREATE TABLE \`chat_messages\` (
        \`id\` varchar(36) NOT NULL,
        \`conversation_id\` varchar(36) NOT NULL,
        \`role\` varchar(16) NOT NULL,
        \`content\` mediumtext NOT NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'ok',
        \`steps\` json NULL,
        \`projects\` json NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_chat_messages_conversation_created\` (\`conversation_id\`, \`created_at\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_chat_messages_conversation\` FOREIGN KEY (\`conversation_id\`) REFERENCES \`conversations\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `chat_messages`');
    await queryRunner.query('DROP TABLE `conversations`');
  }
}
