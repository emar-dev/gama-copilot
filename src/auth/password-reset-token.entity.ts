import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Lien de réinitialisation du mot de passe. Le jeton envoyé par e-mail n'est jamais
 * stocké : seule son empreinte SHA-256 l'est. Usage unique, durée de vie courte.
 */
@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_password_reset_tokens_user_id')
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_password_reset_tokens_user',
  })
  user?: User;

  @Index('UQ_password_reset_tokens_token_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'datetime', precision: 6, nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'requested_ip', type: 'varchar', length: 45, nullable: true })
  requestedIp!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
