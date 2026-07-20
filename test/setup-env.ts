import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

process.env.DATABASE_URL =
  'postgresql://user:password@localhost:5432/triskcraft';
process.env.API_URL = 'https://api.example.com';
process.env.IDENTITY_PRIVATE_KEY = privateKey;
process.env.IDENTITY_PUBLIC_KEY = publicKey;
process.env.IDENTITY_KEY_ID = 'test-key';
process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters';
process.env.DISCORD_CLIENT_ID = 'discord-client';
process.env.DISCORD_CLIENT_SECRET = 'discord-secret';
process.env.DISCORD_REDIRECT_URI = 'https://api.example.com/oauth/discord';
process.env.DISCORD_GUILD_ID = 'guild-id';
process.env.DISCORD_REST_TOKEN = 'discord-rest-token';
process.env.SUPER_USER_DISCORD_ID = 'super-user-id';
