# Flamingo’s · Punto de venta

POS web en español para un negocio de alimentos. Todas las pantallas siguen un formato de celular; en pantallas grandes se muestra la misma composición centrada. Usa los colores del logo entregado, ilustraciones SVG locales y una base de datos central persistente. Admite PostgreSQL en Supabase para la operación y SQLite para la demostración local.

La interfaz usa cristal esmerilado en navegación, pedido y diálogos, con texto de alto contraste y superficies de datos claras. El propietario entra al resumen; el cajero, a la venta. Las decisiones y fuentes de las skills consultadas se documentan en `DESIGN.md`.

### Flujos rápidos

Los accesos aceptan **correo o usuario y contraseña**, y **Continuar con Google** cuando está configurado Supabase Auth. Crea primero al propietario desde la aplicación local conectada a Supabase; después entra a **Más opciones → Equipo → Agregar persona** para crear cajeros o propietarios. Usa contraseñas de al menos 10 caracteres. Para Google registra el correo de esa cuenta: solo los usuarios activos ya autorizados en el POS pueden entrar. Google no crea propietarios ni cajeros automáticamente. No se envían invitaciones ni códigos por correo.

- Venta con búsqueda sin acentos, seis categorías y 33 tarjetas que agrupan las 60 variantes del menú del cliente. Las botellas se eligen por presentación; las escarchas por tamaño y sabor; los bolos por sabor. El acceso inferior abre el pedido o permite ir directo al cobro.
- Pago con botón **Exacto**, importes frecuentes, vuelto visible y **Nueva venta** desde el comprobante.
- Arqueo con progreso, búsqueda de insumos, **Solo pendientes** y **Siguiente pendiente**. Enter pasa al siguiente insumo sin completar. Las cantidades vacías no equivalen a cero; los filtros no omiten la validación de campos obligatorios.
- Borrador local por usuario, turno y versión, con aviso cuando no puede guardarse. Cada reconteo comienza con campos vacíos y conserva declaraciones anteriores.
- Revisión que muestra primero las diferencias; los productos coincidentes se pueden desplegar. Acceso directo al arqueo pendiente desde el resumen.
- Resumen con estado actual de caja separado del período de ventas y accesos **Hoy**, **Ayer**, **Últimos 7 días** y fechas personalizadas.

El catálogo, el pedido, los pagos, el inventario, los historiales y el resumen están adaptados al formato de celular. El teclado virtual, las áreas seguras y el tacto en Safari/Android requieren validación en dispositivos físicos.

### Menú y control de stock

Los precios proceden de las dos fotos del cliente. Ver `MENU.md`. Las existencias de demostración son ficticias; la configuración real comienza con saldo cero.

- Botellas, bolos, empanadas y dulces listos descuentan una unidad por venta. Los sabores y presentaciones tienen saldos separados.
- Las escarchas comparten mezcla por sabor. Vender una chica descuenta 250 ml, una mediana 300 ml y una grande 500 ml. Reposición, merma y conteo de líquidos se introducen en litros; el servidor almacena ml enteros.
- Los 11 preparados (sándwiches, hamburguesa, cafés y batidos) necesitan recetas confirmadas. Se muestran como pendientes y no se pueden vender hasta configurarlos. Se recomienda empezar por porciones fáciles de contar. El propietario puede elegir explícitamente **Solo registrar ventas**, con aviso de que no habrá control de stock para ese producto.

El menú se importa una sola vez al iniciar, entre turnos. Conserva los comprobantes, precios históricos y arqueos anteriores. El catálogo original de demostración se archiva; el stock coincidente se conserva. Si hay un turno activo, la importación se aplaza hasta reiniciar después de aprobar su cierre. Las posteriores ediciones de precios y recetas no se sobrescriben al reiniciar.

## Iniciar

Requiere **Node.js 24.14 o superior de la rama 24** (desarrollado y probado con 24.14.1).

```powershell
cd D:\Proyectos\FLAMINGO
npm ci
npm run demo
```

Abre <http://127.0.0.1:3000>. La demostración usa `data/demo.sqlite` y lo indica en pantalla.

| Usuario de demostración | Contraseña | Rol |
| --- | --- | --- |
| `admin` | `Flamingo2026!` | Propietario (Valentina) |
| `camila` | `Flamingo2026!` | Cajera |

Los productos, precios, recetas y existencias de demostración son ejemplos, no datos proporcionados por el cliente. Las operaciones de prueba realizadas en el navegador también permanecen en esta base separada.

Para conectar el negocio real con Supabase, sigue `SUPABASE.md`: configura `.env`, crea la credencial limitada con `npm run db:configure` y verifica con `npm run db:check`. Después detén la demo y ejecuta:

```powershell
npm start
```

Entra desde el mismo equipo a <http://127.0.0.1:3000> y crea el propietario. La base real empieza sin ventas y sin existencias, con el menú transcrito del cliente. Configura las recetas pendientes y el stock inicial antes de operar. El registro inicial del propietario solo se permite desde localhost y no hay credenciales predeterminadas. Sin conexión PostgreSQL configurada, el modo local usa `data/flamingo.sqlite`; `DATABASE_BACKEND=postgres` exige la conexión y evita iniciar por accidente con SQLite.

## Qué incluye

- Catálogo por categoría, búsqueda sin acentos, carrito, cantidades, notas y pedidos para aquí / llevar.
- Efectivo y vuelto, registro de QR, tarjeta y pagos mixtos. QR y tarjeta se verifican manualmente con la app bancaria o terminal; no hay procesamiento bancario integrado.
- Comprobante imprimible e historial de ventas. El comprobante interno **no es factura fiscal**.
- Base PostgreSQL/Supabase central o SQLite local: los dispositivos conectados al servidor comparten los datos. El resumen y la disponibilidad de productos se actualizan cada 15 segundos mientras la página está visible. En PostgreSQL, cada operación usa una transacción y los cambios de caja se coordinan entre instancias.
- Propietarios y cajeros con usuarios individuales. Sesiones de 12 horas en cookies HttpOnly, contraseñas con scrypt, permisos comprobados en el servidor y limitación de intentos de inicio de sesión.
- Reposiciones, mermas y recetas editables que descuentan ingredientes. Las cantidades son enteras: para fracciones usa gramos, mililitros o porciones como unidad base.
- El vendedor puede reponer desde **Más opciones → Inventario → Reponer** durante su propio turno abierto. Cada entrada conserva el usuario, turno, cantidad, fecha y referencia; el propietario la consulta en **Inventario → Últimos movimientos**. El propietario también puede reponer entre turnos. Las reposiciones se bloquean durante el arqueo.
- Apertura de turno con confirmación del inventario y fondo recibidos. Declaración independiente del trabajador, revisión del propietario, reconteos con historial y aprobación con explicación obligatoria de diferencias.
- Anulación de ventas del turno abierto, motivo obligatorio y reversión de stock basada en los insumos originales de la venta. La devolución del dinero debe realizarse fuera del sistema; si la comida no se recupera, registra la merma correspondiente.
- Resumen por rango de fechas: ventas, ticket promedio, medios de pago, cajeros, productos vendidos y horas. Fechas del negocio en Bolivia (UTC−4).
- Exportación CSV de ventas **recientes**: hasta 500 para propietarios y 100 propias para cajeros. El resumen usa todas las ventas del período, sin este límite. Historial de turnos: últimos 60 para el propietario; movimientos: últimos 100.
- Copias consistentes con `npm run backup`: exportación de datos JSON para PostgreSQL o archivo SQLite en modo local. `npm run backup -- --demo` respalda exclusivamente la demo. Ver alcance y restauración en `SUPABASE.md`.

## Cómo funciona el arqueo

Este MVP representa **una sucursal y una caja compartida, con un turno activo y un responsable a la vez**. Hay varios cajeros, que se relevan entre turnos. No representa cajas simultáneas ni depósitos separados. El propietario puede consultar el resumen desde otro dispositivo mientras el cajero trabaja.

1. Antes de abrir, configura productos, insumos, recetas, stock inicial y usuarios.
2. El cajero inicia sesión, revisa el inventario recibido y confirma la entrega junto con el efectivo inicial. Si las existencias cambian mientras revisa, debe actualizar la recepción.
3. Cada venta descuenta el producto envasado o sus ingredientes. El servidor calcula los precios; rechaza stock insuficiente y pagos que no suman el total.
4. Las reposiciones ingresan unidades. Las mermas descuentan unidades con su motivo. No se registran como ventas.
5. El responsable o el propietario selecciona **Turnos y arqueos → Iniciar arqueo**. El servidor fija los saldos esperados y bloquea ventas, reposiciones, mermas y anulaciones en todos los dispositivos hasta aprobar el cierre.
6. El stock esperado es `inicial + reposiciones − ventas − mermas + devoluciones por anulación`. El efectivo esperado es `fondo inicial + efectivo aplicado a ventas vigentes`; excluye QR y tarjeta y ya descuenta el vuelto.
7. El responsable del turno selecciona **Ingresar mi conteo**, cuenta todos los insumos y el efectivo y envía su declaración. Los saldos esperados no se muestran en su formulario ni se envían a la API del cajero durante el arqueo. El borrador se guarda en su dispositivo. Enviar no ajusta stock ni cierra el turno.
8. El propietario compara **Sistema y trabajador**. Puede solicitar un reconteo indicando el motivo. El responsable envía una nueva versión, con explicación, y se conservan la declaración anterior, autores, fechas y motivos.
9. El propietario selecciona **Revisar y aprobar**. Si hay diferencias, debe explicarlas. La aprobación usa exclusivamente la última declaración, ajusta las existencias una sola vez y cierra el turno. No se generan ventas ficticias ni deudas del trabajador.
10. El conteo aprobado queda como existencia para el siguiente turno. El nuevo cajero confirma lo que recibe realmente. Los arqueos antiguos siguen disponibles como registros históricos.

Estados: **turno abierto → conteo en curso → pendiente de revisión → arqueo aprobado**. Una solicitud de reconteo vuelve al conteo con una versión nueva y conserva el mismo saldo del sistema al corte. Solo el responsable del turno puede declarar; solo un propietario puede aprobar. Si el propietario también opera la caja, puede declarar y aprobar su propio turno. No hay aprobación automática ni reanudación de ventas durante la revisión.

**Ejemplo:** comienzas con 30 sodas, recibes 12, vendes 15 y pierdes 1 por daño. Debe haber 26. Si cuentas 25, el arqueo conserva un faltante de 1 y exige una explicación. Con Bs 100 de fondo y Bs 80 cobrados en efectivo, deben quedar Bs 180, aunque también haya ventas por QR.

Las recetas de hamburguesas descuentan pan, carne, queso y vegetales según el producto. Para helado a granel y escarchas, configura las recetas reales en gramos/mililitros; los ejemplos de catálogo descuentan una porción. Los insumos nuevos se agregan entre turnos para conservar el punto de partida del arqueo.

## Usarlo desde tablet o celular

Para una prueba dentro de una red local de confianza, detén el servidor y usa:

```powershell
$env:HOST = '0.0.0.0'
npm start
```

Accede desde los otros dispositivos con `http://IP-DEL-EQUIPO:3000` (todos en la misma red). Puede requerirse configurar el firewall del equipo. No se modificó el firewall ni se abrió el router durante el desarrollo.

**Para monitorear fuera del local hace falta desplegar este servidor en un hosting con disco persistente y HTTPS**, o conectarse mediante una VPN segura al servidor del local. Esta entrega se ejecuta localmente; no se publicó en Internet. Consulta [DEPLOYMENT.md](DEPLOYMENT.md).

No hay modo de venta sin conexión. Si no se conoce el resultado de un cobro, se conserva su identificador localmente y se permite reintentar la misma operación; el servidor evita duplicados incluso después de recargar. No borres el almacenamiento del navegador mientras exista un cobro pendiente.

## Configuración

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Interfaz de escucha |
| `PORT` | `3000` | Puerto HTTP |
| `DATABASE_PATH` | `data/flamingo.sqlite` | Ruta persistente de SQLite; con `--demo` usa `data/demo.sqlite` si no se especifica |
| `COOKIE_SECURE` | `false` | Pon `true` detrás de HTTPS |

La moneda es Bs y el horario es Bolivia. Si el cliente opera en otro país, deben ajustarse ambos en servidor e interfaz. No incluye facturación fiscal, integración bancaria, varias sucursales, turnos/cajas simultáneos, compras a proveedores, retiros/gastos de caja ni impresión directa a hardware específico. El flujo de caja actual presupone que no se retira efectivo durante el turno.

## Verificación

```powershell
npm run check
npm test
```

Las pruebas cubren autenticación, aislamiento de roles, base persistente, cálculo monetario en centavos, transacciones atómicas, stock compartido entre recetas, idempotencia, pagos mixtos, anulaciones históricas, reposiciones, mermas, arqueos concurrentes y fechas de Bolivia. Se verificó también el flujo visual de apertura, cobro en efectivo con vuelto, QR, resumen y arqueo en el navegador.

SQLite se utiliza a través de `node:sqlite` integrado en Node 24.14.1; esa versión emite un aviso experimental del módulo. Referencia: [documentación oficial de SQLite en Node 24](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).

## Estructura

```text
server.js              Servidor HTTP, sesiones y rutas de API
lib/store.js           SQLite, transacciones y reglas del negocio
public/                Interfaz web y recursos locales
tests/store.test.js    Pruebas de negocio e integración HTTP
scripts/backup.js      Respaldo consistente con SQLite Backup API
data/                  Bases y respaldos locales (no versionar)
```
