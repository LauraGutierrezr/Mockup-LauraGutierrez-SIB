import { Module } from '@nestjs/common';
import { CatalogoService } from './catalogo/catalogo.service';
import { ServiciosController } from './catalogo/servicios.controller';
import { AprobacionesController } from './catalogo/aprobaciones.controller';
import { IngestaController } from './catalogo/ingesta.controller';
import { ResumenController } from './catalogo/resumen.controller';

@Module({
  controllers: [ServiciosController, AprobacionesController, IngestaController, ResumenController],
  providers: [CatalogoService],
})
export class AppModule {}
