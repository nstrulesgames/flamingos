# Flamingo en Supabase

Proyecto autorizado: `oozvdybbdajbmfwikczt`, cuenta `nstrulesgames`.

## Estado de esta entrega

- Aplicadas las migraciones iniciales: 18 tablas privadas en el esquema `flamingo`.
- Cargados los 60 productos del menú y 37 insumos/productos controlados, con stock cero.
- No se copiaron usuarios, saldos ni ventas de la demo.
- Roles de propietario/cajero, contraseñas y sesiones siguen siendo administrados por el backend del POS. No se usa Supabase Auth en esta versión.
- El servidor local está conectado a Supabase mediante una credencial limitada, guardada en `.env.runtime` e ignorada por Git. `/api/status` devuelve `database: "postgres"` y `demo: false`.
- La conexión MCP de desarrollo permite administrar la base, pero no es la credencial que utiliza el servidor.

## Activar la conexión

1. En el [proyecto de Supabase](https://supabase.com/dashboard/project/oozvdybbdajbmfwikczt), abre **Connect → Session pooler**. Usa la cadena exacta de ese panel, que funciona en redes IPv4. La contraseña requerida es la de la base de datos, no la de tu cuenta de Supabase.
2. Guarda `DATABASE_URL="postgresql://..."` en `.env`, dentro de este proyecto. Sustituye el marcador de contraseña; codifica caracteres especiales de la contraseña para una URL. Agrega `DATABASE_BACKEND=postgres`. `.env.example` muestra los otros ajustes.
3. Ejecuta `npm ci` y `npm run db:configure`. Con la conexión administrativa, este comando crea un usuario de base de datos aleatorio con los permisos del rol limitado `flamingo_app`. Guarda su credencial en `.env.runtime`; nunca imprime la contraseña. No sobrescribe un archivo de credenciales existente.
4. Ejecuta `npm run db:check`. Debe mostrar `connected: true`, versión de esquema `1`, 60 productos y 37 elementos de inventario. El rol de conexión debe comenzar por `flamingo_runtime_`.
5. Detén el servidor de demostración y ejecuta `npm start`. La consola debe indicar `[SUPABASE / POSTGRESQL]`. `GET /api/status` devuelve `database: "postgres"`.
6. Desde el mismo equipo, abre `http://127.0.0.1:3000`, crea al propietario y luego a los cajeros. Configura recetas y existencias reales antes de abrir un turno.

El servidor da prioridad a `FLAMINGO_DATABASE_URL` de `.env.runtime`. Después de comprobarla, puedes retirar de `.env` la conexión administrativa y conservar únicamente la credencial limitada. No compartas ni publiques los archivos `.env*`. En el hosting, configura `FLAMINGO_DATABASE_URL` como secreto del servidor y `DATABASE_BACKEND=postgres`.

La demo (`npm run demo`) siempre usa SQLite, aunque exista una conexión a Supabase. Un fallo de conexión PostgreSQL impide el arranque; no cambia silenciosamente a SQLite.

## Garantías de almacenamiento

- Precios y pagos en centavos enteros; unidades de stock enteras (ud, ml, g o porciones).
- Ventas, detalle y movimientos de inventario se confirman o revierten juntos.
- Bloqueo transaccional de la única caja compartida: coordina cambios entre varios procesos del servidor. No agrega varias cajas físicas al modelo actual.
- Reintentos de venta y de declaración con el mismo identificador no duplican registros.
- Consultas de resumen y arqueos usan una vista consistente de los datos.
- RLS habilitado en las 18 tablas. Los roles públicos `anon` y `authenticated` no tienen acceso al esquema. `flamingo_app` permite la operación del backend; no debe asignarse a usuarios del navegador.
- Las credenciales, hashes de contraseñas y tokens de sesión nunca se envían al navegador. El backend valida roles actuales, incluso después de autenticarse.
- El propietario controla precios, recetas y altas; el trabajador declara y el propietario aprueba. Iniciar el arqueo congela ventas y movimientos hasta la aprobación.

## Migraciones

Los SQL versionados están en `supabase/migrations/`. Se aplican una sola vez, en orden:

1. `202610060001_flamingo_initial.sql`: esquema, tablas, restricciones, índices y permisos.
2. `202610060002_client_menu.sql`: catálogo del cliente e inventario vacío.
3. `202610090001_units_and_packages.sql`: inventario por unidades y reposición por paquete (esquema 2).
4. `202610090002_customer_credit.sql`: clientes con saldo a favor (esquema 3).

En el proyecto indicado ya se aplicaron. No vuelvas a ejecutarlas manualmente sobre esas tablas. No modifican el esquema `public` ni importan el archivo de demostración.

## Respaldo y restauración

`npm run backup` detecta la conexión PostgreSQL y exporta las tablas del negocio en una única transacción de lectura consistente. Guarda un JSON fechado en `data/backups/`; excluye sesiones para que una restauración obligue a iniciar sesión de nuevo. El respaldo incluye hashes de contraseñas y debe mantenerse privado y copiarse fuera del servidor.

Este archivo es una exportación lógica de datos, no un `pg_dump`: no incluye funciones, roles, extensiones ni configuración del proyecto. Las definiciones de las tablas están en las migraciones. Para una restauración se requiere un proyecto/base vacío con la primera migración aplicada, insertar los datos en el orden del archivo (actualizando `settings`), reajustar las secuencias de identidad y provisionar una nueva credencial limitada. La restauración no está automatizada ni se ha ensayado contra Supabase. Para recuperación completa del proyecto, conserva también un respaldo nativo de PostgreSQL y verifica el procedimiento antes de operar con datos reales.

## Comprobaciones

`npm test` ejecuta las pruebas existentes de SQLite y pruebas PostgreSQL con PGlite (motor PostgreSQL local), usando un rol sin privilegios de propietario. Incluye transacciones, doble envío, stock insuficiente, arqueo ciego, reconteos, permisos, horario boliviano, HTTP y respaldo lógico.

PGlite dispone de una sola sesión y verifica los flujos de negocio localmente. Se comprobó además Supabase con dos conexiones independientes: el bloqueo de caja excluye una operación concurrente y se libera al finalizar la transacción. El rol limitado puede registrar ventas, pero no borrar ventas ni crear objetos en el esquema. El backend local responde con PostgreSQL activo y muestra el formulario de alta del propietario. Falta completar esa cuenta, cargar stock real y validar el negocio en celulares y hosting.

El controlador carga la CA pública de Supabase desde `certs/supabase-ca.crt` para sus endpoints oficiales y mantiene la validación del certificado y del nombre del servidor. Un despliegue que necesite otra autoridad de confianza puede indicar un archivo mediante `DATABASE_SSL_CA`.

El asesor de seguridad de Supabase no reportó problemas en las tablas nuevas. Detectó una advertencia del servicio Supabase Auth sobre [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); ese servicio no gestiona los usuarios de este POS.

Referencias: [conexiones y pooler](https://supabase.com/docs/guides/database/connecting-to-postgres), [privacidad de datos](https://supabase.com/docs/guides/database/secure-data).
