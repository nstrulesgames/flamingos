# Fiado, abonos y archivados

La venta incorpora **Fiado**: se selecciona un cliente autorizado, se escribe cuánto paga ahora y el medio de pago. Puede pagar cero. Cualquier saldo a favor disponible se usa primero y el resto se registra como deuda, dentro del límite configurado por la propietaria. El vendedor necesita permiso de fiado en Equipo. Todos los permisos nuevos empiezan desactivados.

**Clientes** muestra «Debe», «A favor» o «Sin deuda», filtros y fecha desde la que mantiene deuda. **Registrar abono** admite efectivo, QR y tarjeta; calcula lo que queda pendiente, exige confirmar pagos digitales y genera un comprobante con usuario y fecha. Si hay exceso se confirma que queda a favor. Las recargas existentes también reducen primero la deuda.

Los abonos se contabilizan en su turno y fecha de recepción, sin duplicar ventas ni modificar arqueos anteriores. El resumen conserva las ventas totales, distingue cuentas por cobrar de saldos a favor y muestra abonos/recargas por medio de pago. El efectivo esperado incluye únicamente entradas y salidas reales de efectivo, además del fondo.

La propietaria puede cargar **Deuda anterior** con motivo, sin crear ventas ni dinero ficticio. **Anular registro** conserva el abono/recarga original y añade una contrapartida con motivo y referencia única. Solo se corrigen movimientos del turno actual (o registrados sin turno); los cierres anteriores se conservan. No se permite revertir saldo que el cliente ya gastó. Una compra fiada del turno que se anula después de recibir abonos deja ese dinero a favor del cliente; su devolución se registra aparte.

**Inventario** permite editar insumos, archivar/restaurar productos e insumos y consultar **Ver archivados**. No se borran referencias históricas. Los insumos se archivan/restauran entre turnos, y solo se archivan con stock cero y sin recetas activas que los utilicen. Cambiar la unidad de un insumo con historial o recetas está bloqueado. La edición de productos archivados identifica sus insumos archivados para evitar sustituciones silenciosas.

## Datos y pruebas

Migración PostgreSQL `20261017150819_customer_debts_and_archives.sql`: esquema 5 → 6, atómica, con bloqueo compartido de caja, tiempos máximos y rechazo de versión incorrecta o reaplicación. Preserva saldos, ventas, movimientos y privacidad. No crea tablas públicas ni amplía permisos del rol de ejecución. La migración SQLite conserva IDs y claves foráneas al retirar la restricción antigua de saldo positivo.

Pruebas nuevas: venta parcialmente fiada, permisos y límites, operaciones concurrentes, abonos en otro turno, efectivo frente a QR, exceso confirmado, deuda anterior, contrapartidas, saldo ya utilizado, anulación de compra con abonos, pausa por arqueo, separación de totales, archivado/restauración y migraciones con historial. Se ejecutan en SQLite y PostgreSQL/PGlite con rol limitado. Las pruebas y la revisión visual usan bases aisladas.

Revisión móvil 390 × 844: compra de Açaí Bs 40, Bs 10 efectivo + Bs 30 fiado; abono QR Bs 20; deuda restante Bs 10; comprobante e historial atribuidos a Camila. Capturas privadas de demostración en `output/fiado-2026-10-17/`.

El conector de asesores de Supabase rechazó el acceso como en la actualización anterior. No se atribuye a esta versión un informe nuevo de asesores. La verificación de privacidad, permisos y conservación de datos se hará mediante SQL en el proyecto autorizado `oozvdybbdajbmfwikczt`, sin divulgar credenciales.

Suite completa: **132/132 aprobadas**, `npm run check` y `git diff --check` correctos. Registro privado: `tmp/debts-all-tests-final.log`.

## Publicación verificada

Código `10d0170`. Despliegue preparado antes de migrar: `dpl_ELUxntSNWGTMp9szR61A9azRwa6C`, `flamingos-2yuowxsbd-nstrulesgames.vercel.app`, promovido a `https://flamingos-psi.vercel.app/`.

Migración `20261017150819 customer_debts_and_archives` aplicada y registrada atómicamente en el proyecto autorizado. Respaldo privado consistente inmediatamente anterior: `data/backups/flamingo-postgres-before-debts-2026-10-17T15-31-12-386Z.json`, excluido de Git y Vercel. La verificación dentro de la transacción comparó todos los campos originales de todas las filas, conservando las 63 ventas, 163 movimientos y 6 clientes.

Comprobación posterior con `flamingo_runtime_3f2d5f712650`: esquema 6, 74 productos, 66 insumos, 5 usuarios, 63 ventas y total histórico 55.250 centavos. Permanecieron los 163 movimientos y la suma de existencias 601.056. Las 20 tablas mantienen RLS y ni anon ni authenticated tienen acceso al esquema privado. La API pública respondió HTTP 200 con PostgreSQL y Google activos; los archivos publicados coinciden con el código probado. No se registraron operaciones ficticias en producción.

El arqueo móvil de demostración confirmó Bs 110 esperados y contados, diferencia cero, con la deuda Bs 30 y el abono QR Bs 20 excluidos del efectivo. Se aprobaron los 29 insumos sin diferencias. Producto archivado encontrado en «Ver archivados» y restaurado desde el mismo flujo.

Revisión final: configuración de fiado guardada desde la ficha del cliente; insumo vacío archivado entre turnos y encontrado en «Ver archivados». Se verificaron claro y oscuro sin errores de consola. Se oculta «Anular registro» en movimientos de turnos cerrados, coherente con el bloqueo del servidor; nueva prueba de interfaz incluida en las 132 pruebas.
