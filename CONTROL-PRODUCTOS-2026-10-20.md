# Configuración de productos con explicaciones

El selector principal ofrece **Descontar stock** y **Solo registrar ventas**. Al guardar una asociación de una unidad a una existencia exclusiva, la pantalla sigue mostrando Descontar stock al volver a abrir. El backend conserva sus controles y vínculos actuales; no hay migración ni actualización masiva de productos.

En **Más > Productos > Editar**, cada producto muestra cómo se cobra y cómo se descuenta. El resumen identifica la existencia, la cantidad por venta, el saldo actual y un ejemplo. Si varias presentaciones comparten el saldo, las identifica y explica que se cuenta una vez en el arqueo.

## Cambiar la configuración

- **Producto nuevo:** Descontar stock permite usar unidades propias o elegir una existencia ya registrada. Si ya ingresaste esa mercadería, elige su existencia para evitar duplicarla. Solo registrar ventas conserva el importe sin descontar stock.
- **Producto existente:** Ver o cambiar qué se descuenta permite revisar y editar las existencias y cantidades por venta. Guardar un precio conserva sus vínculos. Un producto con saldo compartido permite solicitar el paso a un saldo propio con una advertencia sobre cantidades que no se transfieren automáticamente.
- **Con un turno abierto:** los controles que cambian las existencias se deshabilitan y se explica que deben modificarse después de la aprobación del arqueo. Se pueden guardar datos y precio con los vínculos actuales. Durante el arqueo no se permite guardar operaciones.
- **Alerta y paquetes:** cada campo explica su función; la alerta no es el stock actual y el paquete no cambia el consumo por venta.
- **Tipo de cobro:** unidad, peso y precio libre tienen explicaciones distintas. El ejemplo de precio fijo o peso utiliza el precio escrito. El peso calcula el importe y no convierte automáticamente el inventario en kilos.

Los cambios de configuración se pueden realizar posteriormente, con las restricciones del turno. Se aplican a ventas futuras y conservan los comprobantes anteriores.

## Verificación

`npm run check` y las 154 pruebas de `npm test` pasaron. Se agregó cobertura de envío del formulario para stock individual, compartido, cambio de vínculo, alta de producto y activación del descuento después de solo ventas. En una demostración aislada se comprobó guardar y reabrir conservando 14 unidades, crear un producto en cero, alternar el control y guardar datos durante un turno con los vínculos protegidos.

La revisión visual utiliza datos ficticios locales. Este cambio no modifica los saldos reales ni requiere migraciones de base de datos. Las guías del 18 de octubre describen los nombres de la versión anterior; este documento registra los nombres nuevos.
