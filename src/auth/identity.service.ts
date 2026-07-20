import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JWTPayload,
} from 'jose';
import type { AccessTokenClaims } from './auth.types';

@Injectable()
export class IdentityService implements OnModuleInit {
  private privateKey!: Awaited<ReturnType<typeof importPKCS8>>;
  private publicKey!: Awaited<ReturnType<typeof importSPKI>>;
  private readonly issuer: string;
  private readonly keyId: string;
  private readonly sessionKey: Uint8Array;

  constructor(private readonly config: ConfigService) {
    this.issuer = this.required('API_URL');
    this.keyId = this.required('IDENTITY_KEY_ID');
    this.sessionKey = new TextEncoder().encode(this.required('SESSION_SECRET'));
  }

  async onModuleInit() {
    this.privateKey = await importPKCS8(
      this.pem('IDENTITY_PRIVATE_KEY'),
      'RS256',
    );
    this.publicKey = await importSPKI(this.pem('IDENTITY_PUBLIC_KEY'), 'RS256');
  }

  async createAccessToken(claims: AccessTokenClaims) {
    return new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: this.keyId, typ: 'JWT' })
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setAudience(claims.aud)
      .setExpirationTime('1h')
      .sign(this.privateKey);
  }

  async createIdToken(subject: string, audience: string) {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: this.keyId, typ: 'JWT' })
      .setSubject(subject)
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setAudience(audience)
      .setExpirationTime('1h')
      .sign(this.privateKey);
  }

  async createSessionToken(subject: string, audience: string, scope: string) {
    return new SignJWT({ scope })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(subject)
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setAudience(audience)
      .setExpirationTime('7d')
      .sign(this.sessionKey);
  }

  async verifyAccessToken(token: string) {
    try {
      return await jwtVerify<AccessTokenClaims & JWTPayload>(
        token,
        this.publicKey,
        { issuer: this.issuer },
      );
    } catch {
      return null;
    }
  }

  private pem(name: string) {
    return this.required(name).replaceAll('\\n', '\n');
  }

  private required(name: string) {
    const value = this.config.get<string>(name);
    if (!value) throw new Error(`Missing configuration: ${name}`);
    return value;
  }
}
