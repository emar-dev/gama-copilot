import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Une session = un appareil connecté. Le refresh token n'est jamais stocké en clair :
 * seule son empreinte SHA-256 est gardée, et elle change à chaque rafraîchissement.
 * Révoquer la session coupe immédiatement l'accès, même si un access token est encore valide.
 */
@Entity('sessions')
export class Session {
  /** Généré côté serveur (randomUUID) avant la signature des jetons, qui le référencent. */
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Index('IDX_sessions_user_id')
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, (user) => user.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_sessions_user' })
  user?: User;

  @Column({ name: 'refresh_token_hash', type: 'char', length: 64 })
  refreshTokenHash!: string;

  /** Session persistante (« Se souvenir de moi ») ou limitée à la session du navigateur. */
  @Column({ type: 'boolean', default: false })
  remember!: boolean;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({
    name: 'revoked_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  revokedAt!: Date | null;

  @Column({
    name: 'last_used_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  lastUsedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  isActive(now = new Date()): boolean {
    return this.revokedAt === null && this.expiresAt.getTime() > now.getTime();
  }
}
