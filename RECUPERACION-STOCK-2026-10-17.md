# Recuperación de los controles de stock de Natalia

La actualización anterior pasó once productos a «Solo registrar ventas» y archivó diecisiete existencias justo después de aprobar el turno #4. Esta corrección recupera los controles personalizados que había configurado la propietaria y conserva las cantidades del último cierre aprobado.

## Datos que se conservan

El turno #4 fue declarado por Demian y aprobado por Natalia Villazon el **17/10/2026 a las 22:31, hora de Bolivia**. Sus cincuenta cantidades aprobadas permanecieron en la base. La recuperación cambia únicamente los vínculos de descuento y los indicadores de existencia activa; no suma unidades, no genera reposiciones ni vuelve a descontar ventas anteriores.

- Hamburguesa express vuelve a descontar de sus 25 unidades.
- Seis cafés vuelven a compartir las 100 medidas de café.
- Dos batidos vuelven a compartir las 100 porciones de proteína.
- Té y té frío vuelven a compartir sus 20 unidades.
- Las diecisiete existencias archivadas por la adaptación vuelven a estar activas con sus cantidades actuales.
- **Sandwich de lomito** vuelve a figurar como existencia independiente con **10 unidades**, tal como estaba registrado. No había un producto de venta ni un precio previo en catálogo, comprobantes o respaldos. Según la indicación «Déjalo como estaba», se conserva ese registro y su historial sin inventar un precio ni crear un producto de venta diferente.
- Açaí conserva precio libre y su configuración específica de solo ventas. Los demás precios y configuraciones se conservan.

Las diferencias que ya estaban en el arqueo aprobado siguen registradas, con sus responsables. Se verifica que usuarios, ventas, movimientos, clientes, saldos, turnos, declaraciones y arqueos permanecen idénticos durante la recuperación.

## Operación en celular

**Más → Productos** muestra los productos con stock propio, los que descuentan de existencias asociadas y los que solo registran ventas. Cada producto con saldo compartido identifica de qué existencia descuenta y muestra cuántas ventas permite ese saldo. El arqueo cuenta una sola vez cada existencia.

**Existencias compartidas y adicionales** conserva los registros que ya utilizaba Natalia, incluidos el lomito y las porciones. La búsqueda también los encuentra y despliega esa sección cuando son el único resultado. Se puede reponer desde el mismo registro y la propietaria puede editar sus datos o registrar merma.

El filtro **Agotados** permite localizar productos sin disponibilidad. En caja aparecen con un icono de advertencia discreto, el texto **Agotado** y el botón deshabilitado. El servidor también rechaza ventas que excedan el saldo, incluso cuando se combinan varias presentaciones que comparten existencias.

Al editar un café o batido, **Descontar de existencias asociadas** conserva su vínculo y su cantidad de consumo. Cambiar ese vínculo requiere terminar el turno; editar el precio con el mismo vínculo no lo cambia. Crear un producto con unidades propias sigue siendo un único formulario.

Se identifica el nombre duplicado «Brownie con topping» en la lista de la propietaria para que revise cuál conservar. La recuperación mantiene ambos registros tal como estaban antes de la adaptación.

## Ejecución y pruebas

Se retiró por completo la conversión automática de controles en SQLite y PostgreSQL. Reiniciar el servidor o aprobar un arqueo conserva los controles de la propietaria. La recuperación no se ejecuta automáticamente al iniciar.

`scripts/recover-stock-controls.js` muestra el plan en modo de solo lectura; `--apply` lo aplica al proyecto autorizado, entre turnos, en una transacción con el bloqueo de caja habitual. Verifica la auditoría original, los vínculos, las cantidades, la ausencia de cambios posteriores y la conservación de catorce tablas de negocio. Deja un registro de reparación del sistema y una marca para evitar repetirla. El marcador antiguo se conserva en 1 para proteger también las instancias anteriores de servidor que puedan seguir activas.

No requiere cambios de esquema ni nuevos permisos: PostgreSQL permanece en versión 6. El plan usa los identificadores originales y rechaza cualquier discrepancia que requiera revisión.

Pruebas específicas: recuperación idempotente, rollback completo ante un fallo intermedio, bloqueo con turno abierto, precisión de microsegundos en auditoría, preservación del historial, descuento de saldos compartidos, reserva de carrito, bloqueo por agotado y conservación del vínculo al guardar precios. La suite completa y las comprobaciones de sintaxis se ejecutan antes de publicar. Las pruebas visuales usan una base de demostración aislada.
