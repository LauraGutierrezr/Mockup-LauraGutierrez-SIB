// Mismo modelo que la base de datos (PostgreSQL u Oracle). Aquí vive en memoria.
export type Ambiente = 'DEV' | 'QA' | 'PRD';
export type Fuente = 'ANOTACION' | 'REPOSITORIO' | 'MANUAL' | 'DEDUCIDO' | 'EXCEL' | 'COLECTOR';

export interface Despliegue {
  ambiente: Ambiente;
  cluster: 'no-prod' | 'prd';
  namespace: string | null;
  version: string | null;
  estado: 'CORRIENDO' | 'ESCALADO_A_CERO' | 'NO_ENCONTRADO';
  vistoEn: string; // ISO
  hash?: string;
}

export interface Servicio {
  clave: string;
  id: string;
  nombre: string;
  descripcion: string | null;
  tecnologia: string | null;
  runtime: string | null;
  tipo: string | null;
  equipo: string | null;
  proyecto: string | null;
  negocio: string | null;
  responsable: string | null;
  estado: string | null;
  criticidad: string | null;
  impacto: string | null;
  documentacion: string | null;
  repositorio: string | null;
  rama: string | null;
  pipelineCI: string | null;
  releaseCD: string | null;
  primerDespliegue: string | null;
  ultimoDespliegue: string | null;
  bases: { nombre: string; esquema: string | null }[];
  secretos: string[];
  llama: string[];
  observaciones: string | null;
  despliegues: Despliegue[];
  /** Campos escritos a mano: el colector nunca los sobrescribe. */
  manual: Record<string, { valor: string; autor: string; fecha: string }>;
}

export interface EventoHistorial {
  id: number;
  servicio: string;
  fecha: string;
  fuente: Fuente;
  autor: string;
  campo: string;
  antes: string | null;
  despues: string | null;
  nota?: string;
}

export interface Aprobacion {
  id: number;
  servicio: string;
  campo: 'criticidad' | 'impacto';
  etiqueta: string;
  valor: string;
  propuestoPor: string;
  fecha: string;
  estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  decididoPor?: string;
}

export const CAMPOS_MANUALES: { campo: keyof Servicio; etiqueta: string; sensible: boolean }[] = [
  { campo: 'criticidad', etiqueta: 'Criticidad', sensible: true },
  { campo: 'impacto', etiqueta: 'Impacto', sensible: true },
  { campo: 'negocio', etiqueta: 'Negocio', sensible: false },
  { campo: 'proyecto', etiqueta: 'Proyecto', sensible: false },
  { campo: 'descripcion', etiqueta: 'Descripción validada', sensible: false },
  { campo: 'documentacion', etiqueta: 'Documentación', sensible: false },
  { campo: 'responsable', etiqueta: 'Responsable técnico', sensible: false },
];

export const LISTAS = {
  criticidad: ['Alta', 'Media', 'Baja'],
  impacto: [
    'Cliente final no puede completar la operación',
    'Operación interna detenida',
    'Afecta reportes o conciliación financiera',
    'Degradación sin pérdida de servicio',
  ],
};
