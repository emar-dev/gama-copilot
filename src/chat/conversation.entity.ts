import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type MessageRole = 'user' | 'assistant';
export type MessageStatus = 'ok' | 'error';

export interface MessageStep {
  tool: string;
  content: string;
}

@Entity('conversations')
@Index('IDX_conversations_user_updated', ['userId', 'updatedAt'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_conversations_user',
  })
  user?: User;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @OneToMany(() => ChatMessage, (message) => message.conversation)
  messages?: ChatMessage[];

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

@Entity('chat_messages')
@Index('IDX_chat_messages_conversation_created', [
  'conversationId',
  'createdAt',
])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conversation_id', type: 'varchar', length: 36 })
  conversationId!: string;

  @ManyToOne(() => Conversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'conversation_id',
    foreignKeyConstraintName: 'FK_chat_messages_conversation',
  })
  conversation?: Conversation;

  @Column({ type: 'varchar', length: 16 })
  role!: MessageRole;

  @Column({ type: 'mediumtext' })
  content!: string;

  /** « error » quand l'agent n'a pas pu répondre (le message reste visible dans l'historique). */
  @Column({ type: 'varchar', length: 16, default: 'ok' })
  status!: MessageStatus;

  /** Outils appelés par l'agent pour produire la réponse (recherche doc, génération, fichiers…). */
  @Column({ type: 'json', nullable: true })
  steps!: MessageStep[] | null;

  /** Projets créés ou modifiés par l'agent pendant cette réponse. */
  @Column({ type: 'json', nullable: true })
  projects!: string[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
