# Açaí con precio libre en caja

El Açaí queda en **Precio libre en caja**. El cajero toca el producto, escribe el importe de la porción según lo cobrado por peso y lo añade al pedido. El campo exige un importe positivo con dos decimales. Porciones con precios distintos se conservan separadas y se pueden corregir con **Editar importe** antes de cobrar.

El comprobante identifica **Precio libre**, conserva cada precio efectivamente cobrado y el usuario de la venta. Los cambios posteriores del catálogo no recalculan los importes históricos. Se mantiene **Solo registrar ventas**; el peso no es obligatorio para el ingreso manual del importe. La propietaria puede cambiar el tipo de cobro desde la edición del producto.

El backend admite un importe manual solo cuando el producto tiene esa opción habilitada. Los demás productos rechazan el intento de reemplazar su precio. Valida centavos enteros, totales de pago, sesión, turno y estado del arqueo. Los reintentos conservan el mismo identificador y los mismos importes.

## Pruebas

- Suite completa: **118/118 aprobadas**, con SQLite, PostgreSQL/PGlite y rol limitado. Registro local: `tmp/free-price-tests-2026-10-15.log`.
- Se verificó además que la migración habilita únicamente el Açaí, conserva su precio anterior y rechaza reaplicación o versión incorrecta; pruebas enfocadas: **8/8 aprobadas**.
- Revisión móvil a 390 × 844 con cajera: cero no permite añadir; Bs 18,50 y Bs 23,00 permanecen separados; editar el primero a Bs 20,50 produce Bs 43,50; recibido Bs 50,00 y vuelto Bs 6,50. El comprobante identifica a Camila. Sin errores de consola.
- El propietario pudo abrir y guardar el producto en precio libre sin que el precio fijo oculto bloqueara el formulario.
- Capturas: `output/precio-libre-2026-10-15/importe-libre.png` y `comprobante-precio-libre.png` en la misma carpeta. Las ventas de prueba solo se hicieron en la demostración y bases aisladas.
- Sintaxis de JavaScript y `git diff --check` correctos.

## Base de datos y publicación

Proyecto Supabase `oozvdybbdajbmfwikczt`, esquema privado `flamingo`. Respaldo consistente privado previo en `data/backups/flamingo-postgres-2026-10-15T14-00-17-146Z.json`, excluido de Git y Vercel.

La migración `20261015135011_free_price_sales.sql` añade las banderas de permiso y de comprobante, activa el modo libre únicamente para el Açaí y lleva el esquema a **5**. El conector MCP rechazó el acceso; se usó la conexión administrativa existente del mismo proyecto, con certificado TLS verificado y validación explícita de la referencia de proyecto. El cambio y su registro `20261015135011 free_price_sales` en `supabase_migrations.schema_migrations` se aplicaron en una misma transacción.

La comprobación posterior mediante el rol limitado confirmó: esquema 5, Açaí activo con precio libre, control de inventario `untracked`, y su precio base de 100 centavos conservado solo como referencia. Permanecieron las 58 ventas, total histórico 50.250 centavos, 125 movimientos y suma de existencias 600.487. Había cero líneas manuales reales al verificar, porque las pruebas no se realizaron en producción.

Permanecen las 20 tablas privadas con RLS y sin acceso al esquema para anon/authenticated. No se cambiaron permisos ni autenticación. El conector también rechazó la consulta de asesores, por lo que no se obtuvo un informe nuevo de ese servicio; las verificaciones de esquema y privacidad se hicieron directamente por SQL.

Código: `7d2c9f0`. Se preparó el despliegue `dpl_HgU1cnjJpuiLLDG9fNJV45F7ukdW` antes de migrar y luego se promovió `https://flamingos-i3xo4175t-nstrulesgames.vercel.app` al dominio `https://flamingos-psi.vercel.app/`. La API devolvió HTTP 200 con PostgreSQL y Google activos; el rol limitado confirmó acceso al esquema 5.
