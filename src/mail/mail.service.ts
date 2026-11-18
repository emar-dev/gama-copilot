import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Envoi d'e-mails par SMTP (variables SMTP_* de l'environnement).
 * En développement sans SMTP configuré, le message est écrit dans la console de l'API
 * pour pouvoir tester les liens. En production, SMTP est obligatoire (voir env.validation).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.from =
      config.get<string>('MAIL_FROM') || 'GAMA-Copilot <no-reply@localhost>';
    this.transporter = host
      ? createTransport({
          host,
          port: Number(config.get('SMTP_PORT') || 587),
          secure: config.get('SMTP_SECURE') === 'true',
          auth: config.get<string>('SMTP_USER')
            ? {
                user: config.get<string>('SMTP_USER'),
                pass: config.get<string>('SMTP_PASSWORD'),
              }
            : undefined,
        })
      : null;
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP non configuré : e-mail non envoyé, affiché ici pour le développement.\n` +
          `À : ${message.to}\nObjet : ${message.subject}\n\n${message.text}`,
      );
      return;
    }
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
