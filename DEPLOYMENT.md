# Publicación y operación

La aplicación está implementada y se puede ejecutar localmente. No se contrató hosting, no se configuró un dominio y no se publicó información del negocio.

## Requisitos del servidor

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
