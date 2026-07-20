import { Controller, Get, Header, HttpException, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PUBLIC_CACHE_CONTROL } from '../common/http-cache';
import { PostsService } from './posts.service';

@ApiTags('public v1')
@Controller('v1/posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  @ApiOperation({ summary: 'List published blog posts' })
  @ApiOkResponse({ description: 'Published post list', type: 'array' })
  getPosts() {
    return this.posts.findAll();
  }

  @Get(':id')
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  @ApiOperation({ summary: 'Get a published blog post by id' })
  @ApiOkResponse({ description: 'Published post' })
  @ApiNotFoundResponse({ schema: { example: { error: 'NotFound' } } })
  async getPost(@Param('id') id: string) {
    const post = await this.posts.findById(id);
    if (!post) throw new HttpException({ error: 'NotFound' }, 404);
    return post;
  }
}
