import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get(':bucket/:filename')
  async get(
    @Param('bucket') bucket: string,
    @Param('filename') filename: string,
    @Res() response: Response,
  ) {
    const object = await this.files.get(bucket, filename);
    response.setHeader(
      'Content-Type',
      object.ContentType ?? 'application/octet-stream',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    if (!(object.Body instanceof Readable))
      throw new Error('Body is not a Node.js stream');
    object.Body.pipe(response);
  }
}
