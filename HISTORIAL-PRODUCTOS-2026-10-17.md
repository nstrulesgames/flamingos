# Historial por producto y acciones de stock

**Más → Productos** muestra las acciones **+ Reponer** y **− Merma** juntas, con nombres visibles y controles táctiles. Merma sigue siendo exclusiva de la propietaria, exige motivo y se deshabilita cuando no hay existencias. El vendedor conserva la reposición durante su propio turno. Ambas operaciones se bloquean durante un arqueo.

El formulario anticipa el resultado: por ejemplo, `Stock: 27 ud → 25 ud` al ingresar una merma de dos unidades. Respeta las conversiones de litros y paquetes completos existentes y el servidor vuelve a validar cantidades, permisos y estado del turno al guardar.

## Consultar el historial

1. En **Productos**, busca un producto y toca **Historial**. Las existencias independientes y compartidas también tienen historial propio, incluido el sándwich de lomito.
2. Elige **Hoy**, **Ayer**, **7 días** o un rango personalizado. Se usa horario de Bolivia, de medianoche a medianoche.
3. En **Ventas del producto**, consulta las unidades, el importe y las ventas del período. Cada registro identifica fecha, cajero, cantidad e importe histórico. El Açaí conserva sus importes libres y pesos registrados, aunque cambie el precio actual.
4. Las ventas anuladas aparecen identificadas y se excluyen de los totales. Los importes de venta incluyen compras fiadas; los abonos no se vuelven a contar como ventas.
5. En **Stock asociado**, consulta las cantidades actuales y los movimientos de reposición, merma, venta, devolución, arqueo y traspaso del período. El stock actual se identifica aparte del rango elegido.
6. Abre un comprobante y usa **Volver al historial** para conservar el producto, las fechas y la vista seleccionada.

**Resumen → Ventas por producto** presenta un listado con búsqueda de todos los productos vendidos en el período del resumen. Tocar un producto abre el mismo historial conservando ese período. La lista identifica los productos por su ID, conservando su continuidad si se corrige el nombre. Los comprobantes y las líneas del historial mantienen el nombre y precio que se registraron al vender.

## Saldos compartidos

Las ventas de Café americano pertenecen a ese producto. Sus existencias asociadas pueden ser compartidas por varias presentaciones; la pestaña de stock lo indica y muestra los movimientos del saldo común, sin atribuir todo el consumo a una sola presentación. Se muestran las existencias asociadas actualmente al producto. El historial de una existencia independiente no inventa ventas ni un precio para ella.

## Alcance y verificación

El historial es exclusivo de la propietaria. Los endpoints autenticados `GET /api/products/:id/history` y `GET /api/inventory/:id/history` comprueban ese permiso en el servidor. El cajero no puede consultar cantidades esperadas mediante estas rutas durante el arqueo.

Los registros se paginan en grupos de 30, con paginación independiente para ventas y stock. Los totales corresponden al período completo, incluso cuando hay más registros que los que caben en una página. No se usa el límite de ventas o movimientos recientes de la pantalla general para calcularlos.

La implementación es de solo lectura: no cambia productos, vínculos, existencias, precios, saldos, turnos ni arqueos. PostgreSQL permanece en esquema 6 y se utilizan los índices existentes de producto, venta y existencia; no requiere migraciones ni permisos nuevos. SQLite y PostgreSQL comparten el mismo plan de consultas y ejecutan la lectura en una transacción consistente.

Las pruebas cubren límites de medianoche en Bolivia, totales completos y paginación, anulaciones, cambios de nombre y precio, importes libres, peso, consumo compartido, registros independientes, períodos vacíos, validación de fechas y páginas, permisos HTTP y consulta durante arqueo. También verifican que respuestas tardías no reabran un diálogo cerrado ni sustituyan otro producto seleccionado. Las pruebas visuales usan una base de demostración separada.

Validación: `npm run check` y las **148 pruebas** de `npm test` completadas sin errores. La revisión móvil a 390 × 844 incluyó modos claro y oscuro, filtros, vista previa de merma, stock compartido y regreso desde el comprobante conservando el período. Las consultas contra Supabase se comprobaron en una transacción de solo lectura; no cambiaron las 18 tablas de negocio verificadas y conservaron las 10 unidades independientes del lomito.
