# Tintorería Francia

Punto de venta para la tintorería: recepción de prendas, cobro, seguimiento de órdenes y datos fiscales para facturar después fuera del sistema. El navegador habla con una API; la API es la única que lee y escribe el negocio en Postgres.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind.
- API: FastAPI (Python 3.12).
- Datos y sesión: Supabase (Auth + Postgres, esquema `tintoreria_francia`).
- Fotos: Cloudflare R2, a través de la API.

## Estructura

```
frontend/     SPA del punto de venta (proyecto Vercel propio)
backend/      API FastAPI (proyecto Vercel propio)
  api/        Rutas, auth y acceso a Supabase
  migrations/ Cambios de esquema, en orden
  supabase_schema.sql
```

El frontend no lee tablas de negocio con la llave anónima. El rol sale de `GET /api/me`. Los precios los resuelve el servidor desde el catálogo.

## Requisitos

- Node LTS
- Python 3.12
- Un proyecto de Supabase

## Desarrollo local

En `backend/`:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env
.venv\Scripts\python -m uvicorn server:app --reload --port 8000
```

En `frontend/`:

```powershell
npm install
copy .env.example .env.local
npm run dev
```

La app queda en `http://localhost:3000`. Sin `NEXT_PUBLIC_API_URL`, Next reenvía `/api` a `http://127.0.0.1:8000`.

## Variables de entorno

| Variable | App | Obligatoria | Descripción |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | frontend | sí | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | frontend | sí | Llave anónima (pública; solo Auth) |
| `NEXT_PUBLIC_API_URL` | frontend | en producción | URL pública del API, sin barra final. Vacía en local |
| `SUPABASE_URL` | API | sí | El mismo proyecto que el frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | API | sí | Solo servidor. Nunca en el frontend |
| `SUPABASE_JWT_SECRET` | API | recomendada | Validación HS256 del access token |
| `CORS_EXTRA_ORIGINS` | API | no | Orígenes extra, separados por coma |
| `R2_ACCOUNT_ID` | API | para fotos | Cuenta de Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | API | para fotos | Access key de R2 |
| `R2_SECRET_ACCESS_KEY` | API | para fotos | Secret de R2 |
| `R2_BUCKET_NAME` | API | para fotos | Bucket |

Plantillas: `frontend/.env.example` y `backend/.env.example`. Los valores reales van en `.env` / `.env.local` y en el dashboard de Vercel, no en git.

## Base de datos

Las tablas no se crean al arrancar la API. En el SQL Editor de Supabase aplica, en orden, los archivos de `backend/migrations/`. `backend/supabase_schema.sql` es el esquema completo de referencia.

`000012` agrega RFC y la marca de factura en la orden. `000013` agrega razón social, código postal, régimen fiscal y uso del CFDI. Sin `000013`, guardar esos campos responde 503.

## Caché en el navegador

Órdenes y Reportes se desmontan al cambiar de panel. Sin caché, cada visita volvería a leer Postgres. La caché es un `Map` en memoria de esa pestaña: no se guarda en `localStorage` ni en el servidor, y un refresco de la página la borra. Dura **30 minutos**. Hay una caja por sucursal, así que la lista no se queda atrás por otro equipo.

**Órdenes** (`frontend/lib/orders-board-cache.ts`). La clave es sucursal + estado (Recibido, En proceso, Listo, Entregado) + búsqueda. La primera vez que abres cada estado se pide la página. Volver a ese estado, o salir y entrar al panel, reutiliza la lista. Al hacer scroll, las páginas siguientes se guardan en la misma entrada.

**Reportes** (`frontend/lib/reports-cache.ts`). La clave es el periodo (`desde` + `hasta`). Cada rango se calcula una vez. Volver a Reportes con el mismo periodo no vuelve a agregar las órdenes.

Se invalida al cobrar una venta o al cambiar el estado de una orden (también el de reportes, porque esos números cambian). Notas y fotos solo invalidan la lista de órdenes. Pasados los 30 minutos, la siguiente visita vuelve a pedir datos.

Clientes, Contabilidad, Catálogo y Administradores no usan esta caché: se leen al abrir el panel. Clientes, catálogo y tarifas de entrega sí quedan en memoria de la sesión desde el arranque.

## Despliegue

Dos proyectos de Vercel. El frontend tiene la raíz en `frontend/`; el API, en `backend/`. `NEXT_PUBLIC_*` se inyecta en el build: cambiarlas exige un deploy nuevo del frontend. Las variables del API son de runtime.

El API permite `http://localhost:3000` y previews `*.vercel.app`. Dominios propios se agregan con `CORS_EXTRA_ORIGINS`.

## Calidad

El pre-commit corre ESLint del frontend (`npm run eslint` en la raíz).

Pruebas del API, desde `backend/` con el venv:

```powershell
.venv\Scripts\python -m unittest
```
