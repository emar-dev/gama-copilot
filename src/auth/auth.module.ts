import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OAuthAccount } from './oauth/oauth-account.entity';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { PasswordResetToken } from './password-reset-token.entity';
import { PasswordResetService } from './password-reset.service';
import { Session } from './session.entity';

@Module({
  imports: [
    UsersModule,
    MailModule,
    TypeOrmModule.forFeature([Session, PasswordResetToken, OAuthAccount]),
    // Les secrets sont passés à chaque signature/vérification (un secret par type de jeton).
    JwtModule.register({ signOptions: { algorithm: 'HS256' } }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: 60_000,
          limit: Number(config.get('AUTH_THROTTLE_LIMIT') || 10),
        },
      ],
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthConfig,
    AuthService,
    PasswordResetService,
    OAuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
