# Publicación y operación

La aplicación puede ejecutarse localmente y publicarse en Vercel con Supabase. Las credenciales y los datos locales quedan fuera del código publicado.

## Requisitos del servidor

### Vercel con Supabase

El repositorio incluye `vercel.json` y una función en `api/index.js`. Vercel sirve `public/` como archivos estáticos y dirige `/api/*` a esa función, sin abrir un archivo SQLite ni iniciar un servidor local. La conexión PostgreSQL se reutiliza dentro de cada instancia. La función incluye el certificado público de Supabase y la región `iad1`, próxima a la base en us-east-1.

En **Settings → Environment Variables**, configura para **Production** (y Preview solo si vas a probar con una base de ensayo):

| Variable | Valor |
| --- | --- |
| `FLAMINGO_DATABASE_URL` | Conexión limitada que generó `npm run db:configure`, guardada en `.env.runtime`. Copia únicamente el valor, sin el nombre ni comillas. |
| `DATABASE_BACKEND` | `postgres` |
| `COOKIE_SECURE` | `true` |

La conexión es PostgreSQL del pooler de Supabase, no `https://...supabase.co` ni una clave `anon`. Los archivos `.env` de tu equipo no se suben a GitHub ni se transfieren automáticamente a Vercel. Para este proyecto se verificó el pooler de sesión `aws-0-us-east-1.pooler.supabase.com:5432`; usa la credencial limitada ya preparada.

Usa Node.js **24.x**, Framework Preset **Other**, directorio raíz del repositorio e instalación `npm ci`. No configures `npm start` como Build Command. El código fija el directorio de salida en `public`; no necesita compilación. Haz **Redeploy** después de cambiar variables: un despliegue existente no recibe esas variables nuevas.

Crea primero el propietario desde `http://127.0.0.1:3000/`, conectado a la misma base de Supabase. El alta está bloqueada en Vercel incluso si la plataforma reenvía una petición mediante localhost.

Comprueba `/api/status`: debe responder HTTP 200 con `database: "postgres"` y `setup: true` cuando ya exista el propietario. Si falta la conexión, responde 503 indicando el nombre de la variable; si falla PostgreSQL, los Logs muestran la clasificación del error sin imprimir la conexión. `FUNCTION_INVOCATION_FAILED` requiere consultar **Logs** para ver la excepción de arranque.

La adaptación se verifica localmente; no sustituye la aceptación del despliegue real. El límite de intentos de inicio de sesión está en memoria por instancia; no es un bloqueo global entre funciones. Los respaldos se ejecutan desde un equipo o servicio con acceso a la base, fuera de la función web.

Referencias: [runtime Node.js](https://vercel.com/docs/functions/runtimes/node-js), [variables de entorno](https://vercel.com/docs/environment-variables), [conexiones a Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

Para usar el proyecto Supabase ya preparado, sigue primero `SUPABASE.md`. El servidor lee `.env` y `.env.runtime`; `FLAMINGO_DATABASE_URL` tiene prioridad sobre `DATABASE_URL`. Las instrucciones de disco persistente de esta sección corresponden al modo SQLite. Con PostgreSQL, los datos permanecen en Supabase y se necesita hosting para el servidor web Node.js, HTTPS y secretos de entorno.

- Node.js 24.14.x o posterior de la rama 24.
- Disco persistente para `data/`; una instancia de la aplicación por base SQLite.
- HTTPS con proxy inverso que preserve `Host` y el dominio público del origen.
- Proceso supervisado con reinicio al arrancar el servidor.
- Respaldo diario fuera del mismo servidor y prueba de restauración.

No usar una función serverless ni un contenedor con disco efímero para alojar el archivo SQLite. Para múltiples instancias o un volumen alto, migrar primero el almacenamiento a un motor cliente-servidor con pruebas de concurrencia.

## Secuencia de publicación

1. Confirmar catálogo, precios, recetas, unidad de cada insumo, moneda y política de caja con el propietario.
2. Copiar el código y crear el propietario desde el servidor local antes de habilitar acceso externo. El alta inicial por HTTP requiere origen de conexión localhost. Se puede usar un túnel SSH local al puerto del servidor para configurar desde el navegador del administrador.
3. Configurar `DATABASE_PATH` hacia un disco persistente, `HOST=127.0.0.1`, `PORT=3000` y `COOKIE_SECURE=true`. Usar `npm start`; **no publicar el modo demo con credenciales conocidas** como si fuera la operación real.
4. Configurar el proxy HTTPS hacia `127.0.0.1:3000`. Mantener el puerto 3000 sin exposición pública directa.
5. Crear los cajeros desde Equipo. Ingresar existencias mediante Reponer stock con referencia “Inventario inicial”.
6. Verificar en dos dispositivos: sesión del cajero, apertura, venta, actualización del resumen del propietario, reposición y arqueo completo. Usar una base de ensayo separada para la aceptación.
7. Configurar respaldos, procedimiento de recuperación y credenciales del administrador bajo control del propietario.

El backend valida permisos independientemente de lo que se muestre en la interfaz. Las sesiones se guardan como hashes de tokens; las contraseñas se derivan con scrypt y sal individual. Los cambios de inventario y ventas se procesan dentro de transacciones. No hay carga de scripts, fuentes, fotos ni analítica de terceros.

## Respaldo

```powershell
npm run backup
```

Usa la API de backup de SQLite, por lo que puede ejecutarse con el servidor en marcha. Crea un archivo fechado en `data/backups`. Respalda también fuera del equipo: un respaldo en el mismo disco no protege de su falla.

Para restaurar: detener el proceso; conservar una copia del directorio de datos actual, incluidos archivos WAL/SHM; colocar la copia verificada en un **directorio nuevo**; apuntar `DATABASE_PATH` al archivo restaurado; iniciar y revisar ventas, stock y turnos. No reemplazar la base en uso. No reutilizar archivos WAL/SHM de otra base.

## Decisiones para validar con el cliente

- ¿Existe una sola caja física o varias cajas simultáneas? Esta versión usa una caja con relevos.
- ¿El propietario cuenta todas las existencias o solo las de cada puesto? Esta versión usa inventario global de una sucursal.
- ¿Reponer significa compra externa o traslado desde un almacén? Esta versión registra ingreso al inventario controlado, sin almacén aparte.
- ¿Helados y escarchas son unidades envasadas o preparados? Las recetas permiten unidades, gramos y mililitros enteros; deben medirse sus porciones reales.
- ¿Se retira efectivo durante el turno para gastos o entregas al propietario? Esta versión requiere que el fondo y los cobros permanezcan en caja hasta el arqueo.
- ¿Qué banco/QR y terminal utilizan? El registro de cobros está listo; una integración automática requiere un proveedor concreto.
- ¿Requiere facturación fiscal? Los comprobantes actuales son internos.

Estas decisiones no impiden probar el POS local, pero deben confirmarse antes de usarlo como registro real del negocio.
