import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PUBLIC_CACHE_CONTROL } from '../common/http-cache';
import { MembersService, type PlayerInclude } from './members.service';

const playerIncludes = new Set<PlayerInclude>([
  'roles',
  'medias',
  'rank',
  'description',
]);

@ApiTags('public v1')
@Controller('v1')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members')
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  @ApiOperation({ summary: 'List active Minecraft members' })
  @ApiOkResponse({ description: 'Enriched active member list', type: 'array' })
  getMembers() {
    return this.members.findMembers();
  }

  @Get('games/minecraft/players')
  @ApiOperation({ summary: 'List active linked Minecraft players' })
  @ApiQuery({
    name: 'includes',
    required: false,
    isArray: true,
    enum: [...playerIncludes],
  })
  @ApiOkResponse({ description: 'Active linked player list', type: 'array' })
  getPlayers(@Query('includes') value?: string | string[]) {
    const values =
      value === undefined ? [] : Array.isArray(value) ? value : [value];
    const includes = new Set(
      values.filter((item): item is PlayerInclude =>
        playerIncludes.has(item as PlayerInclude),
      ),
    );
    return this.members.findPlayers(includes);
  }
}
