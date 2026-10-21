# Catálogo SIB mockup navegable

# Laura Valentina Gutierrez - proyecto SIB

Demo de la Propuesta A del inventario de servicios: la web (pieza 5) conectada a una API real que hace también de worker y base de datos en memoria. Los 257 servicios salen del Excel `Inventario_Microservicios_Plantilla`

Es un mockup para mostrar cómo funciona: no tiene Entra ID, ni base de datos, ni colectores reales. Al reiniciar la API los datos vuelven al estado del Excel

## Requisitos

- Node.js 20 o superior (`node -v`)
- Acceso a npm para instalar dependencias la primera vez

## Cómo correrlo

```bash
cd api
npm install
npm start
```

Abre **http://localhost:3000**. Para usar otro puerto: `PORT=8080 npm start`
Windows PowerShell: `$env:PORT=8080; npm start`

Con Docker, desde la carpeta raíz:

```bash
docker build -f api/Dockerfile -t catalogo-sib-demo .
docker run -p 8080:8080 catalogo-sib-demo
```

y abre http://localhost:8080.

## Asi lo presento:

La barra de arriba tiene los 8 pasos del recorrido, en el mismo orden de la guía de presentación:

1. **Recolección**: “Ejecutar barrido” envía una foto real a `POST /api/v1/demo/barrido` → la API compara y guarda. Cada barrido sube la versión de `clientespqrsrca` en QA. Con “Simular un fallo” el barrido queda incompleto y aparece el aviso.
2. **Avisos**: tarjeta de Teams, correo de pendientes y Excel con los números reales de la API.
3. **Ingreso**: login simulado; muestra los roles que devuelve `GET /api/v1/yo`.
4. **Inicio**: proyectos, pendientes, estado de barridos y cambios recientes. “Simular que PRD dejó de reportar” hace que la ficha avise de dato viejo.
5. **Búsqueda**: sugerencias tolerantes a errores (`clientpq`, `factura`) y filtros.
6. **Ficha**: resumen, ambientes, dependencias, impacto, historial y fuentes.
7. **Impacto**: recorrido hacia atrás desde un servicio o desde su base.
8. **Datos manuales**: completar con listas cerradas; criticidad e impacto pasan a aprobación del líder técnico.

“Ver como” cambia el rol (Lector, Técnico, Restringido, Líder técnico). La web envía la cabecera `X-Demo-Rol` y **la API quita los campos** que ese rol no puede ver, como se hará con los roles del token de Entra ID.

El panel “Detrás de escena” muestra cada llamada real a la API con su tiempo de respuesta. “Reiniciar demo” vuelve al estado inicial.

## Qué hay en cada carpeta

| Carpeta | Pieza de la Propuesta A | Qué hace en la demo | En producción |
|---|---|---|---|
| `api/src/catalogo/servicios.controller.ts` | 2 · API | Buscar, sugerencias, ficha, impacto, historial, completar datos | NestJS en PRD, namespace `sib-inventario` |
| `api/src/catalogo/ingesta.controller.ts` | 2 · API | Recibe la foto del colector (`POST /api/v1/ingesta/fotos`) | Exige token de Entra ID con rol `Ingesta.Colector` |
| `api/src/catalogo/catalogo.service.ts` | 3 · Worker y 4 · Base | Compara fotos, historial, aprobaciones, pendientes, todo en memoria | Worker en segundo plano + PostgreSQL u Oracle |
| `api/src/catalogo/busqueda.ts` | 4 · Base | Búsqueda por trigramas | `tsvector` + `pg_trgm` u Oracle Text |
| `api/src/comun/rol.ts` | Seguridad | Rol por cabecera `X-Demo-Rol` | App roles del JWT de Entra ID, validados con JWKS |
| `api/data/servicios.json` | Carga única del Excel | Datos iniciales | Migración única, marcada “por confirmar” |
| `web/` | 5 · Web | HTML + CSS + JS sin compilar, estilo Homecenter | React + PatternFly |

## Endpoints

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/api/v1/resumen` | Números de la portada, barridos, listas cerradas |
| GET | `/api/v1/catalogo` | Todos los servicios en vista corta |
| GET | `/api/v1/servicios?q=&proyecto=&equipo=&tecnologia=&ambiente=&tipo=` | Búsqueda con filtros |
| GET | `/api/v1/servicios/sugerencias?q=` | Sugerencias mientras se escribe |
| GET | `/api/v1/servicios/:clave` | Ficha filtrada por rol |
| GET | `/api/v1/servicios/:clave/impacto?desde=servicio\|base` | Análisis de impacto |
| GET | `/api/v1/servicios/:clave/historial` | Historial (solo se agregan filas) |
| PATCH | `/api/v1/servicios/:clave` | Completar datos manuales |
| GET | `/api/v1/aprobaciones` | Aprobaciones |
| POST | `/api/v1/aprobaciones/:id/aprobar` · `/rechazar` | Decisión del líder técnico |
| POST | `/api/v1/ingesta/fotos` | Entrada de los colectores |
| GET | `/api/v1/mis-pendientes` · `/api/v1/yo` | Pendientes del usuario y sus permisos |
| POST | `/api/v1/demo/barrido` · `/demo/prd-sin-reportar` · `/demo/reiniciar` | Solo para la demo |

Ejemplo:

```bash
curl -H "X-Demo-Rol: lector" http://localhost:3000/api/v1/servicios/clientespqrsrca
```

## Para cambiar datos

Edita `api/data/servicios.json` y reinicia la API. Los cambios hechos desde la web viven solo en memoria
