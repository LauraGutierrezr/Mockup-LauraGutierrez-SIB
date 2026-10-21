import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * En producción el rol llega en el JWT de Entra ID (app roles) y la API lo valida con JWKS.
 * En la demo se simula con la cabecera X-Demo-Rol.
 */
export type Rol = 'lector' | 'tecnico' | 'restringido' | 'lider';

export interface Permisos {
  rol: Rol;
  usuario: string;
  tecnico: boolean;      // namespaces, rutas, dependencias, bases y esquemas, secretos (nombre), pipelines
  restringido: boolean;  // IP, hosts, puertos, variables interpretadas
  editar: boolean;       // curador o responsable
  aprobar: boolean;      // líder técnico
  roles: string[];
}

const TABLA: Record<Rol, Omit<Permisos, 'rol' | 'usuario'>> = {
  lector: { tecnico: false, restringido: false, editar: false, aprobar: false, roles: ['Inventario.Lector'] },
  tecnico: { tecnico: true, restringido: false, editar: true, aprobar: false, roles: ['Inventario.Lector', 'Inventario.Tecnico', 'Inventario.Curador'] },
  restringido: { tecnico: true, restringido: true, editar: false, aprobar: false, roles: ['Inventario.Lector', 'Inventario.Tecnico', 'Inventario.Restringido'] },
  lider: { tecnico: true, restringido: false, editar: true, aprobar: true, roles: ['Inventario.Lector', 'Inventario.Tecnico', 'Inventario.Curador', 'Inventario.Aprobador'] },
};

export function permisosDe(rol: string | undefined, usuario?: string): Permisos {
  const r = (rol && rol in TABLA ? rol : 'tecnico') as Rol;
  return { rol: r, usuario: usuario || 'Carlos Cantillo', ...TABLA[r] };
}

export const Usuario = createParamDecorator((_d: unknown, ctx: ExecutionContext): Permisos => {
  const req = ctx.switchToHttp().getRequest();
  return permisosDe(req.headers['x-demo-rol'], req.headers['x-demo-usuario'] ? decodeURIComponent(req.headers['x-demo-usuario']) : undefined);
});
