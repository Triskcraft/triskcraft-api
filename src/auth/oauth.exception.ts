import { HttpException } from '@nestjs/common';

export class OAuthException extends HttpException {
  constructor(message: string, status: number) {
    super({ error: message }, status);
  }
}
