import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** bcrypt ignore tout ce qui dépasse 72 octets : on refuse plutôt que de tronquer en silence. */
export const MAX_PASSWORD_LENGTH = 72;
export const MIN_PASSWORD_LENGTH = 8;

export class LoginDto {
  @Transform(trimLower)
  @IsEmail({}, { message: "Cette adresse e-mail n'est pas valide." })
  @MaxLength(254, { message: 'Cette adresse e-mail est trop longue.' })
  email!: string;

  @IsString({ message: 'Saisissez votre mot de passe.' })
  @IsNotEmpty({ message: 'Saisissez votre mot de passe.' })
  @MaxLength(MAX_PASSWORD_LENGTH, {
    message: `Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_LENGTH} caractères.`,
  })
  password!: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}

export class ForgotPasswordDto {
  @Transform(trimLower)
  @IsEmail({}, { message: "Cette adresse e-mail n'est pas valide." })
  @MaxLength(254, { message: 'Cette adresse e-mail est trop longue.' })
  email!: string;
}

export class ResetPasswordDto {
  /** 32 octets aléatoires encodés en base64url. */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/, {
    message:
      "Ce lien de réinitialisation n'est pas valide ou a expiré. Demandez-en un nouveau.",
  })
  token!: string;

  @IsString({ message: 'Choisissez un mot de passe.' })
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Choisissez au moins ${MIN_PASSWORD_LENGTH} caractères.`,
  })
  @MaxLength(MAX_PASSWORD_LENGTH, {
    message: `Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_LENGTH} caractères.`,
  })
  password!: string;
}

export class RegisterDto {
  @Transform(trim)
  @IsString({ message: 'Indiquez votre nom.' })
  @Length(2, 100, {
    message: 'Le nom doit contenir entre 2 et 100 caractères.',
  })
  name!: string;

  @Transform(trimLower)
  @IsEmail({}, { message: "Cette adresse e-mail n'est pas valide." })
  @MaxLength(254, { message: 'Cette adresse e-mail est trop longue.' })
  email!: string;

  @IsString({ message: 'Choisissez un mot de passe.' })
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Choisissez au moins ${MIN_PASSWORD_LENGTH} caractères.`,
  })
  @MaxLength(MAX_PASSWORD_LENGTH, {
    message: `Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_LENGTH} caractères.`,
  })
  password!: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
