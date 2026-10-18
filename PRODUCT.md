# Flamingo’s

POS en español para un establecimiento de alimentos, bebidas, escarchas y bolos. Una caja compartida, un turno activo y varios cajeros que se relevan. Importes en bolivianos; zona horaria America/La_Paz. El menú corresponde a las fotografías del cliente; solo las existencias de demo son ejemplos.

Toda la operación se realiza desde celular, incluyendo cajeros y propietaria. El cajero añade productos, elige variantes y cobra desde acciones inferiores. En el arqueo declara todas las existencias físicas y el efectivo sin ver cantidades esperadas. La propietaria compara ambas fuentes, pide reconteos o aprueba desde su celular. Solo aprobar ajusta el inventario. Preservar permisos, historial, idempotencia y congelamiento de operaciones durante el conteo.

Más → Productos reúne precio, cantidades y reposición. Crear un producto con «Contar unidades» genera su existencia en cero, sin configurar ingredientes. Se respetan siempre las existencias y descuentos que configure la propietaria, incluidos saldos compartidos de café, té y proteína. Editar precios, reiniciar o aprobar un arqueo no puede convertir productos en solo ventas ni archivar existencias automáticamente. El producto agotado muestra un aviso discreto y se bloquea su venta. El Açaí mantiene precio libre y solo ventas por decisión específica; ese cobro es independiente del control de stock. Las existencias adicionales, incluido Sandwich de lomito, permanecen visibles y se cuentan una sola vez.

Pedido de diseño: glassmorphism con colores rojo, amarillo y blanco del logo existente. Prioridad: legibilidad, controles táctiles, claridad de estado y pocas acciones. No requiere aprobación adicional para ejecutar esta dirección ya solicitada.

Productos muestra **+ Reponer**, **− Merma** e **Historial**. El historial es de solo lectura y exclusivo de la propietaria; se abre también desde las ventas por producto del Resumen conservando su período. Separar siempre las ventas del producto de los movimientos de sus existencias compartidas. Mostrar stock actual aparte del período, mantener importes históricos y excluir anulaciones de los totales. La consulta nunca cambia saldos ni cantidades aprobadas.
