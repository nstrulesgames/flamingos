# Inventario por productos · 17 de octubre de 2026

La operación del negocio utiliza productos terminados. Esta actualización reúne precio, cantidad y reposición en **Más → Productos**, sin pedir ingredientes ni recetas.

## Para la propietaria

1. Abre **Más → Productos → Nuevo producto** o toca el lápiz de uno existente.
2. Ingresa nombre, categoría y precio; el cobro puede ser por unidad, por peso o con precio libre.
3. En **Control del producto**, elige:
   - **Contar unidades de este producto**: cada venta descuenta una unidad. Configura la alerta y las unidades por paquete. El registro de existencias se crea automáticamente en cero.
   - **Solo registrar ventas**: registra ingresos y unidades vendidas, sin descontar inventario ni pedir conteo de ese producto.
4. Guarda y usa **Reponer** para ingresar las existencias físicas. No hace falta configurar otro registro de inventario.
5. Para cambiar el tipo de control de un producto existente o archivar/restaurar un producto con unidades, termina primero el arqueo del turno activo.

Cafés, batidos, hamburguesa express y Helado de Açaí quedan en **Solo registrar ventas**, según confirmación del cliente. El Açaí conserva **Precio libre en caja**. Las bebidas, bolos, sándwiches y demás productos que ya tenían stock propio conservan su conteo.

El filtro permite ver productos con unidades, solo ventas o archivados. Archivar retira el producto de nuevas operaciones y conserva su cantidad e historial. La propietaria puede restaurarlo entre turnos. **Movimientos de productos** identifica fecha, cantidad, usuario y referencia de cada reposición; las mermas siguen siendo exclusivas de la propietaria.

## Para el vendedor

1. En **Más → Productos**, busca el producto y toca **Reponer**.
2. Ingresa las unidades recibidas o los paquetes completos cuando corresponda. La referencia es opcional.
3. Confirma. La reposición queda atribuida a tu usuario y turno; solo puedes hacerla durante tu turno abierto.
4. Vende desde **Vender**, como antes. Cafés, batidos, hamburguesas y Açaí no necesitan existencias para venderse.
5. En el arqueo, cuenta únicamente los productos con control de unidades y el efectivo. El conteo independiente, las diferencias, el reconteo y la aprobación de la propietaria mantienen su funcionamiento.

## Adaptación de datos anteriores

Se aplica una sola vez en una transacción con el bloqueo habitual de caja y deja constancia en auditoría con `products_only_version=1`.

- Si hay un turno abierto, conserva su inventario y sus cantidades hasta aprobar su cierre. La adaptación se aplica después de aprobarlo y antes del siguiente turno.
- Un producto con un registro propio de unidades y consumo de una unidad conserva ese mismo registro y stock.
- Los preparados que consumían ingredientes compartidos, cantidades medidas o varias partes pasan a **Solo registrar ventas**. No se inventan porciones a partir de gramos, litros o ingredientes.
- Los ingredientes y registros sin producto contado se archivan conservando sus cantidades. Sus movimientos, ventas y arqueos anteriores permanecen disponibles; la receta anterior se conserva en la auditoría de la adaptación.
- No cambia precios, ventas, usuarios ni saldos de clientes. No genera mermas ficticias ni ajustes de cantidad.

La propietaria puede habilitar unidades de un producto posteriormente, entre turnos. Cuando no existe un stock propio reutilizable, comienza en cero y se repone con las unidades realmente disponibles.

## Verificación técnica

Se conserva el esquema PostgreSQL **6**; no se requiere DDL nuevo. La adaptación usa campos existentes de productos, inventario, recetas, ajustes y auditoría. Se respaldó PostgreSQL antes de publicar.

Pruebas: `npm run check` y **140 pruebas automatizadas**, incluyendo ambos adaptadores (SQLite y PostgreSQL con rol limitado), creación sin ingredientes, reposición, venta y descuento, prevención de cambios de control/archivado durante un turno, conservación de cantidades al cambiar control y archivar/restaurar, conversión aplazada hasta cerrar el turno y aislamiento de ingredientes compartidos. Revisión visual en celular de creación y reposición en una base de demostración separada.

## Publicación verificada

Código `e97c13f`, publicado en GitHub y Vercel: `dpl_Ga8zLpzztaQtfZyJHKb2XbFDQbAe`, estado Ready, dominio `https://flamingos-psi.vercel.app/`. La API respondió HTTP 200 con PostgreSQL y Google activos; los archivos públicos comprobados coinciden con el código probado. La revisión móvil 390 × 844 no mostró errores de consola. Captura de demostración en `output/productos-2026-10-17/productos-celular.jpg`.

Respaldo privado anterior al despliegue: `data/backups/flamingo-postgres-2026-10-17T20-34-06-536Z.json`, excluido de Git y Vercel. La comparación posterior verificó sin cambios las 14 tablas de usuarios, ventas, movimientos, clientes, turnos y arqueos, además de todas las cantidades y los demás datos de productos.

**La adaptación de datos queda aplazada:** al publicar estaba abierto el turno #4. Se conservaron sus 50 registros activos y su historial; la adaptación a 33 registros de productos se ejecutará automáticamente al aprobar su cierre. No se cerró ni modificó el turno real para probar. Los casos de aplicación inmediata, espera, cierre y siguiente turno se verificaron en bases aisladas con SQLite y PostgreSQL.
