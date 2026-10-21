import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { Permisos, Usuario } from '../comun/rol';
import { CatalogoService } from './catalogo.service';

@Controller('api/v1/servicios')
export class ServiciosController {
  constructor(private readonly catalogo: CatalogoService) {}

  /** Lista con búsqueda y filtros. GET /api/v1/servicios?q=factura&proyecto=RCA */
  @Get()
  listar(@Query('q') q?: string, @Query('equipo') equipo?: string, @Query('proyecto') proyecto?: string,
         @Query('tecnologia') tecnologia?: string, @Query('ambiente') ambiente?: string, @Query('tipo') tipo?: string,
         @Query('limite') limite?: string) {
    return this.catalogo.listar(q, { equipo, proyecto, tecnologia, ambiente, tipo }, limite ? Number(limite) : 40);
  }

  /** Sugerencias mientras se escribe (meta ≤ 0,2 s). */
  @Get('sugerencias')
  sugerencias(@Query('q') q = '') {
    return this.catalogo.sugerencias(q);
  }

  /** Ficha del servicio, con los campos que el rol puede ver. */
  @Get(':clave')
  ficha(@Param('clave') clave: string, @Usuario() p: Permisos) {
    return this.catalogo.ficha(clave, p);
  }

  /** Análisis de impacto hacia atrás. ?desde=base parte de la base y esquema del servicio. */
  @Get(':clave/impacto')
  impacto(@Param('clave') clave: string, @Query('desde') desde: string, @Usuario() p: Permisos) {
    return this.catalogo.impacto(clave, desde === 'base' ? 'base' : 'servicio', p);
  }

  @Get(':clave/historial')
  historial(@Param('clave') clave: string) {
    return this.catalogo.historialDe(clave);
  }

  /** Completar datos manuales. Criticidad e impacto pasan a aprobación del líder técnico. */
  @Patch(':clave')
  actualizar(@Param('clave') clave: string, @Body() cambios: Record<string, string>, @Usuario() p: Permisos) {
    return this.catalogo.actualizarManual(clave, cambios, p);
  }
}
