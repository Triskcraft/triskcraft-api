import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import Busboy from 'busboy';
import type { Request } from 'express';

const FILE_BUCKETS = { web: 'public-web', blog: 'blog-media' } as const;

@Injectable()
export class FilesService {
  private readonly client: S3Client;

  constructor(config: ConfigService) {
    this.client = new S3Client({
      region: 'us-east-1',
      endpoint: config.getOrThrow<string>('S3_URL'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  async get(bucket: string, filename: string) {
    const configuredBucket = FILE_BUCKETS[bucket as keyof typeof FILE_BUCKETS];
    if (!configuredBucket)
      throw new NotFoundException({ error: 'Bucket no encontrado' });
    try {
      return await this.client.send(
        new GetObjectCommand({ Bucket: configuredBucket, Key: filename }),
      );
    } catch (error) {
      if (isS3NotFound(error)) {
        throw new NotFoundException({ error: 'Archivo no encontrado' });
      }
      throw error;
    }
  }

  async uploadModpack(request: Request) {
    await this.ensureBucket(FILE_BUCKETS.web);
    return new Promise<void>((resolve, reject) => {
      const parser = Busboy({ headers: request.headers });
      let upload: Promise<unknown> | null = null;
      parser.on('file', (_name, stream, info) => {
        upload = new Upload({
          client: this.client,
          params: {
            Bucket: FILE_BUCKETS.web,
            Key: 'pack-mods-triskcraftsmp.rar',
            Body: stream,
            ContentType: info.mimeType,
          },
          partSize: 10 * 1024 * 1024,
          queueSize: 4,
        }).done();
      });
      parser.once('error', reject);
      parser.once('finish', () => {
        if (!upload) return reject(new Error('No se recibió ningún archivo'));
        void upload.then(() => resolve(), reject);
      });
      request.pipe(parser);
    });
  }

  private async ensureBucket(bucket: string) {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (error) {
      if (
        error instanceof Error &&
        ['NotFound', 'NoSuchBucket'].includes(error.name)
      ) {
        await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
        return;
      }
      throw error;
    }
  }
}

function isS3NotFound(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (['NoSuchKey', 'NotFound', 'NoSuchBucket'].includes(error.name))
    return true;
  const metadata = (
    error as Error & { $metadata?: { httpStatusCode?: number } }
  ).$metadata;
  return metadata?.httpStatusCode === 404;
}
