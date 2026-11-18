import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { ChatService } from './chat.service';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SendMessageDto {
  @Transform(trim)
  @IsString({ message: 'Écrivez votre demande.' })
  @IsNotEmpty({ message: 'Écrivez votre demande.' })
  @MaxLength(4000, {
    message: 'La demande ne peut pas dépasser 4 000 caractères.',
  })
  message!: string;
}

export class RenameConversationDto {
  @Transform(trim)
  @IsString()
  @Length(1, 200, {
    message: 'Le titre doit contenir entre 1 et 200 caractères.',
  })
  title!: string;
}

/** Conversations avec le copilote, propres à chaque utilisateur. */
@Controller('conversations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { conversations: await this.chat.list(user.id) };
  }

  /** Nouvelle conversation à partir d'une première demande. */
  @Post()
  start(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    return this.chat.send(user.id, null, dto.message);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.chat.get(user.id, id);
  }

  @Post(':id/messages')
  @HttpCode(200)
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.send(user.id, id, dto.message);
  }

  @Patch(':id')
  async rename(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RenameConversationDto,
  ) {
    return { conversation: await this.chat.rename(user.id, id, dto.title) };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.chat.remove(user.id, id);
  }
}
