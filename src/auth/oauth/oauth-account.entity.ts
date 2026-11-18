import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

export type OAuthProviderId = 'google' | 'github';

/** Lien entre un compte GAMA-Copilot et une identité Google ou GitHub. */
@Entity('oauth_accounts')
@Index('UQ_oauth_accounts_provider_user', ['provider', 'providerUserId'], {
  unique: true,
})
export class OAuthAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_oauth_accounts_user_id')
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_oauth_accounts_user',
  })
  user?: User;

  @Column({ type: 'varchar', length: 20 })
  provider!: OAuthProviderId;

  /** Identifiant stable chez le fournisseur (sub Google, id numérique GitHub). */
  @Column({ name: 'provider_user_id', type: 'varchar', length: 255 })
  providerUserId!: string;

  /** Adresse vérifiée fournie lors de la dernière connexion. */
  @Column({ type: 'varchar', length: 254, nullable: true })
  email!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
