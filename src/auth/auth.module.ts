import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DiscordOAuthService } from './discord-oauth.service';
import { IdentityService } from './identity.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, DiscordOAuthService, IdentityService],
  exports: [IdentityService],
})
export class AuthModule {}
