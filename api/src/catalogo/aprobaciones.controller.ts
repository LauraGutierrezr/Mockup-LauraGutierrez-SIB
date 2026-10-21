import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Permisos, Usuario } from '../comun/rol';
import { CatalogoService } from './catalogo.service';

@Controller('api/v1/aprobaciones')
export class AprobacionesController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get()
  listar() { return this.catalogo.listarAprobaciones(); }

  @Post(':id/aprobar')
  aprobar(@Param('id', ParseIntPipe) id: number, @Usuario() p: Permisos) { return this.catalogo.decidir(id, true, p); }

  @Post(':id/rechazar')
  rechazar(@Param('id', ParseIntPipe) id: number, @Usuario() p: Permisos) { return this.catalogo.decidir(id, false, p); }
}
