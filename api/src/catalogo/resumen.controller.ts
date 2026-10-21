import { Controller, Get } from '@nestjs/common';
import { Permisos, Usuario } from '../comun/rol';
import { CatalogoService } from './catalogo.service';

@Controller('api/v1')
export class ResumenController {
  constructor(private readonly catalogo: CatalogoService) {}

  /** Números de la portada, estado de barridos y listas cerradas. */
  @Get('resumen')
  resumen() { return this.catalogo.resumen(); }

  /** Vista compacta de todo el catálogo (para la portada y el reporte). */
  @Get('catalogo')
  catalogoCompleto() { return this.catalogo.catalogo(); }

  @Get('mis-pendientes')
  pendientes() { return this.catalogo.misPendientes(); }

  /** Quién soy y qué puedo ver (en producción sale del token). */
  @Get('yo')
  yo(@Usuario() p: Permisos) { return p; }
}
