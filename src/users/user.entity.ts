import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Session } from '../auth/session.entity';

@Entity('users')
@Index('UQ_users_email', ['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Toujours stocké en minuscules, sans espaces autour. */
  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  /**
   * Hash bcrypt. Jamais chargé par défaut : il faut le demander explicitement.
   * Null pour un compte créé via Google ou GitHub tant qu'aucun mot de passe n'a été choisi.
   */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 100,
    nullable: true,
    select: false,
  })
  passwordHash!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @OneToMany(() => Session, (session) => session.user)
  sessions?: Session[];
}

/** Forme publique d'un utilisateur, la seule qui sort de l'API. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}
