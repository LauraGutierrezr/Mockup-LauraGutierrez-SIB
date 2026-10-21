import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CatalogoService } from './catalogo.service';

@Controller('api/v1')
export class IngestaController {
  constructor(private readonly catalogo: CatalogoService) {}

  /**
   * Entrada de los colectores (pieza 1). En producción exige un token de Entra ID con el rol Ingesta.Colector.
   * Cuerpo: { cluster: "no-prod" | "prd", despliegues: [{ servicio, ambiente, namespace, version, estado, hash }], errores?: [] }
   */
  @Post('ingesta/fotos')
  @HttpCode(202)
  ingerir(@Body() foto: any) { return this.catalogo.ingerir(foto); }

  /** Solo demo: simula el barrido de no-prod con un cambio de versión en clientespqrsrca (QA). */
  @Post('demo/barrido')
  barrido(@Body() body: { fallo?: boolean }) { return this.catalogo.barridoDemo(!!body?.fallo); }

  /** Solo demo: simula que el clúster PRD dejó de reportar. */
  @Post('demo/prd-sin-reportar')
  prd(@Body() body: { valor?: boolean }) { return this.catalogo.marcarPrdSinReportar(!!body?.valor); }

  /** Solo demo: vuelve al estado inicial. */
  @Post('demo/reiniciar')
  reiniciar() { this.catalogo.reiniciar(); return { ok: true }; }
}
