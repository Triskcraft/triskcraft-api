import Joi from 'joi';

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  API_URL: Joi.string().uri().required(),
  IDENTITY_PRIVATE_KEY: Joi.string().min(1).required(),
  IDENTITY_PUBLIC_KEY: Joi.string().min(1).required(),
  IDENTITY_KEY_ID: Joi.string().default('triskcraft-identity-1'),
  SESSION_SECRET: Joi.string().min(32).required(),
  DISCORD_CLIENT_ID: Joi.string().required(),
  DISCORD_CLIENT_SECRET: Joi.string().required(),
  DISCORD_REDIRECT_URI: Joi.string().uri().required(),
  DISCORD_GUILD_ID: Joi.string().required(),
  DISCORD_REST_TOKEN: Joi.string().required(),
  SUPER_USER_DISCORD_ID: Joi.string().required(),
  WEBHOOK_ENCRYPTION_KEY: Joi.string().required(),
}).unknown(true);
