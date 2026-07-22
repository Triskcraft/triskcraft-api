import { Readable } from 'node:stream';
import type { Response } from 'express';
import { FilesController } from './files.controller';
import type { FilesService } from './files.service';

describe('FilesController', () => {
  it('preserves download headers and streams the S3 body', async () => {
    const stream = Readable.from('archive');
    const pipe = jest.spyOn(stream, 'pipe').mockReturnValue(stream);
    const get = jest.fn().mockResolvedValue({
      Body: stream,
      ContentType: 'application/x-rar-compressed',
    });
    const files = {
      get,
    } as unknown as FilesService;
    const setHeader = jest.fn();
    const response = {
      setHeader,
    } as unknown as Response;

    await new FilesController(files).get('web', 'mods.rar', response);

    expect(get).toHaveBeenCalledWith('web', 'mods.rar');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/x-rar-compressed',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="mods.rar"',
    );
    expect(pipe).toHaveBeenCalledWith(response);
  });
});
