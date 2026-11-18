import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: normalizeEmail(email) } });
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.users.exists({ where: { email: normalizeEmail(email) } });
  }

  /** Seul accès qui charge le hash du mot de passe, réservé à la vérification de connexion. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  create(data: {
    email: string;
    name: string;
    passwordHash: string | null;
  }): Promise<User> {
    const user = this.users.create({
      email: normalizeEmail(data.email),
      name: data.name.trim(),
      passwordHash: data.passwordHash,
    });
    return this.users.save(user);
  }
}
