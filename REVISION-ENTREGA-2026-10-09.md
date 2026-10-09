# Revisión de la entrega del 9 de octubre de 2026

Se integró el código de `flamingos-entrega.zip` conservando las correcciones locales de cobros, formularios, actualización entre dispositivos y arqueos. El paquete de origen y una copia de los archivos previos quedan en `tmp/entrega-2026-10-09/`, excluido de Git y Vercel.

## Funcionalidad incorporada

- Stock por tipo de bolo, escarchas por vaso y reposición por paquetes completos.
- Sándwiches por unidad; hamburguesas, cafés y batidos registran ventas sin consumo de inventario.
- Reposiciones del vendedor atribuidas a su usuario; bajas de stock reservadas a la propietaria.
- La propietaria puede vender en la caja abierta, agregar insumos entre operaciones, restablecer contraseñas y contar por un vendedor ausente con motivo obligatorio.
- Cambio de contraseña propia con revocación de otras sesiones.
- Clientes con saldo a favor: vuelto guardado, recargas, pagos, devoluciones, ajustes e historial.

## Problemas corregidos al integrar

- Campos de cliente ocultos ya no impiden confirmar un cobro. Al desmarcar el vuelto guardado, dejan de ser obligatorios.
- Los selectores también se bloquean durante un cobro incierto; se conserva su solicitud original.
- Las recargas inciertas conservan cliente, importe y solicitud. El reintento y la recuperación tras recargar la página usan la misma operación.
- Si una operación se guardó y después falló la actualización de pantalla, se informa que fue guardada.
- El recibo separa el vuelto entregado del vuelto guardado como saldo.
- Las recargas digitales requieren confirmar la recepción del pago. El efectivo requiere caja abierta; los botones respetan el turno y el arqueo.
- La propietaria puede encontrar y reactivar clientes inactivos.
- El respaldo reconoce la versión real y funciona antes de crear las tablas de clientes.
- Las migraciones comparten el bloqueo de las operaciones de caja y tienen tiempos máximos para esperar bloqueos.

## Validación

`npm run check` correcto y `npm test`: **105 pruebas aprobadas, 0 fallos**. Incluyen ventas y cobros, reintentos, permisos, recetas y paquetes, clientes y saldo, arqueo completo, contraseña propia, sesiones, migraciones y respaldo. PostgreSQL se prueba con PGlite y el rol limitado; las pruebas HTTP usan bases aisladas.

La vista local de demostración está en `http://127.0.0.1:3006/`. No contiene datos del negocio real. Se verificó en un teléfono de 390 × 844 píxeles: cobro tras desmarcar vuelto guardado, cliente creado durante la venta, vuelto separado en el recibo, pago con saldo, confirmación de recarga QR, recuperación de una recarga guardada cuya respuesta se perdió (sin duplicación tras recargar la página), y reposición de un paquete de 100 vasos atribuida al vendedor.

El arqueo de demostración también se completó desde el celular: el propietario contó en lugar de la cajera, el formulario exigió un motivo y conservó su autor. Los 29 insumos coincidieron. El efectivo esperado fue Bs 132,00 (fondo 100 + ventas en efectivo 24 + vuelto guardado 8); la recarga QR de Bs 10,00 no aumentó el efectivo. La aprobación cerró el turno con diferencia Bs 0,00. El resumen mostró ventas Bs 26,50 y saldo a favor Bs 15,50.

Capturas locales: `output/revision-entrega-2026-10-09/vuelto-guardado.png`, `recarga-recuperada.png` y `arqueo-aprobado.png` en la misma carpeta.

## Supabase y publicación

Proyecto: `oozvdybbdajbmfwikczt` (`supabase-bisque-car`), cuenta `nstrulesgames`, esquema privado `flamingo`.

Antes de migrar se verificó el esquema 1 y 36 ventas. El turno 1 pasó de abierto a conteo durante la revisión; se hizo un segundo respaldo para conservar ese estado. Respaldos consistentes privados en `data/backups/flamingo-postgres-2026-10-09T17-38-46-870Z.json` y `data/backups/flamingo-postgres-2026-10-09T18-06-09-995Z.json`, excluidos de Git y Vercel.

Las migraciones nuevas son `202610090001_units_and_packages.sql` y `202610090002_customer_credit.sql`, en ese orden. Las migraciones iniciales ya existen en Supabase y no deben repetirse.

El usuario autorizó publicar esta versión y aplicar las migraciones de forma coordinada. Se preparó y compiló el despliegue de producción antes de actualizar la base y promoverlo. Las migraciones quedaron registradas como `20261009180622 flamingo_units_and_packages` y `20261009180634 flamingo_customer_credit`.

Verificación posterior: esquema 3, 20 tablas privadas con RLS, sin acceso al esquema para `anon` ni `authenticated`, y permisos de lectura/escritura para el rol limitado del backend. Permanecieron las 36 ventas (total histórico 28.350 centavos), 59 movimientos, 37 insumos y turno 1 en conteo. Las nuevas tablas de clientes y movimientos de saldo quedaron vacías; las operaciones de prueba se hicieron únicamente en la demostración.

Vercel: despliegue `dpl_DAfWYCRUt46fz4gkp21ZmUSSnRFA`, URL `https://flamingos-h7bxvxr3x-nstrulesgames.vercel.app`, promovido al proyecto Flamingos. `https://flamingos-psi.vercel.app/api/status` devolvió HTTP 200 con PostgreSQL, configuración completa y Google habilitado. `npm run db:check` confirmó conexión mediante el rol limitado y esquema 3. Código integrado en commit `364d02d`.

Los asesores no detectaron problemas nuevos de RLS. Se conserva el aviso previo de Supabase Auth sobre [protección frente a contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), sin cambiar la configuración de autenticación. El asesor de rendimiento informó [índices aún no utilizados](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index); se conservaron porque las nuevas tablas están vacías y los índices respaldan consultas y claves foráneas.

El menú nuevo se instala entre turnos o después de aprobar el arqueo abierto. No se aprueba ni se altera el turno real desde las pruebas. Tras el cambio de menú, se deben cargar los vasos y sándwiches que existan físicamente; las cantidades no se inventan ni se convierten desde litros.
