import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuthConfig } from './auth.config';
import { MAX_PASSWORD_LENGTH } from './dto/auth.dto';
import { PasswordResetToken } from './password-reset-token.entity';
import { Session } from './session.entity';

export const INVALID_RESET_LINK =
  "Ce lien de réinitialisation n'est pas valide ou a expiré. Demandez-en un nouveau.";

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string,
  );
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly users: UsersService,
    @InjectRepository(PasswordResetToken)
    private readonly tokens: Repository<PasswordResetToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mail: MailService,
    private readonly config: AuthConfig,
  ) {}

  /**
   * Ne renvoie rien et ne lève jamais : la réponse HTTP est identique, et part aussi vite,
   * que le compte existe ou non. Le travail (base + e-mail) se fait en arrière-plan.
   */
  request(email: string, ip: string | null): Promise<void> {
    const done = this.createAndSend(email, ip).catch((error: unknown) => {
      this.logger.error(
        'Échec de la demande de réinitialisation',
        error instanceof Error ? error.stack : String(error),
      );
    });
    return done;
  }

  async reset(token: string, newPassword: string): Promise<void> {
    if (Buffer.byteLength(newPassword, 'utf8') > MAX_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_LENGTH} octets.`,
      );
    }
    const record = await this.tokens.findOne({
      where: { tokenHash: sha256(token) },
      relations: { user: true },
    });
    const now = new Date();
    if (
      !record ||
      !record.user ||
      record.usedAt !== null ||
      record.expiresAt.getTime() <= now.getTime()
    ) {
      throw new BadRequestException(INVALID_RESET_LINK);
    }

    const passwordHash = await hash(newPassword, this.config.bcryptRounds);
    await this.dataSource.transaction(async (manager) => {
      // Mise à jour conditionnelle : si deux requêtes utilisent le lien en même temps, une seule passe.
      const claimed = await manager.update(
        PasswordResetToken,
        { id: record.id, usedAt: IsNull() },
        { usedAt: now },
      );
      if (claimed.affected !== 1)
        throw new BadRequestException(INVALID_RESET_LINK);

      await manager.update(User, { id: record.userId }, { passwordHash });
      // Les autres liens encore ouverts et toutes les sessions sont invalidés.
      await manager.update(
        PasswordResetToken,
        { userId: record.userId, usedAt: IsNull() },
        { usedAt: now },
      );
      await manager.update(
        Session,
        { userId: record.userId, revokedAt: IsNull() },
        { revokedAt: now },
      );
    });

    void this.mail
      .send(this.confirmationEmail(record.user))
      .catch((error: unknown) => {
        this.logger.error(
          "Échec de l'e-mail de confirmation",
          error instanceof Error ? error.stack : String(error),
        );
      });
  }

  private async createAndSend(email: string, ip: string | null) {
    const user = await this.users.findByEmail(email);
    if (!user) return;

    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      // Un seul lien valide à la fois : une nouvelle demande annule les précédentes.
      await manager.update(
        PasswordResetToken,
        { userId: user.id, usedAt: IsNull() },
        { usedAt: now },
      );
      await manager.save(
        manager.create(PasswordResetToken, {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(
            now.getTime() + this.config.resetTokenTtlMinutes * 60_000,
          ),
          usedAt: null,
          requestedIp: ip?.slice(0, 45) ?? null,
        }),
      );
    });

    const link = new URL(this.config.passwordResetUrl);
    link.searchParams.set('token', token);
    await this.mail.send(this.resetEmail(user, link.toString()));
  }

  private resetEmail(user: User, link: string) {
    const minutes = this.config.resetTokenTtlMinutes;
    const name = escapeHtml(user.name);
    return {
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe GAMA-Copilot',
      text:
        `Bonjour ${user.name},\n\n` +
        `Une réinitialisation du mot de passe a été demandée pour votre compte GAMA-Copilot.\n\n` +
        `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable ${minutes} minutes, utilisable une seule fois) :\n` +
        `${link}\n\n` +
        `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.\n`,
      html:
        `<p>Bonjour ${name},</p>` +
        `<p>Une réinitialisation du mot de passe a été demandée pour votre compte GAMA-Copilot.</p>` +
        `<p><a href="${escapeHtml(link)}">Choisir un nouveau mot de passe</a></p>` +
        `<p>Ce lien est valable ${minutes} minutes et ne peut servir qu'une fois.</p>` +
        `<p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.</p>`,
    };
  }

  private confirmationEmail(user: User) {
    const name = escapeHtml(user.name);
    return {
      to: user.email,
      subject: 'Votre mot de passe GAMA-Copilot a été modifié',
      text:
        `Bonjour ${user.name},\n\n` +
        `Le mot de passe de votre compte GAMA-Copilot vient d'être modifié. Tous vos appareils ont été déconnectés.\n\n` +
        `Si vous n'êtes pas à l'origine de ce changement, réinitialisez immédiatement votre mot de passe depuis la page de connexion.\n`,
      html:
        `<p>Bonjour ${name},</p>` +
        `<p>Le mot de passe de votre compte GAMA-Copilot vient d'être modifié. Tous vos appareils ont été déconnectés.</p>` +
        `<p>Si vous n'êtes pas à l'origine de ce changement, réinitialisez immédiatement votre mot de passe depuis la page de connexion.</p>`,
    };
  }
}
