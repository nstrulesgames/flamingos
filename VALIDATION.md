# Validación de Flamingo’s

## Acceso con Google — 6 de octubre de 2026

- 51 pruebas pasan: el SDK oficial genera PKCE y verifica el usuario contra Supabase Auth; las pruebas de callback comprueban cookie temporal, código de un solo uso, ausencia de tokens del proveedor en el navegador y retorno seguro.
- PostgreSQL solo emite sesión para correos existentes y activos, conserva el rol del POS y rechaza desconocidos o desactivados. Los roles sugeridos por metadatos no se usan.
- El proveedor Google está activo en el proyecto y el inicio real de OAuth respondió 302 hacia `accounts.google.com`, sin elegir una cuenta ni registrar usuarios del negocio.
- El paquete de Vercel incluye el módulo Google y excluye credenciales y datos locales. La activación del botón queda pendiente de confirmar las Redirect URLs y crear el propietario desde la aplicación local; `GOOGLE_AUTH_ENABLED=false` permite publicar el código sin activar ese flujo.
- El consentimiento y el acceso completo con una cuenta real de Google requieren una prueba manual posterior. El código no crea al propietario automáticamente.

## Integración PostgreSQL — 6 de octubre de 2026

- Aplicadas y verificadas en Supabase (`oozvdybbdajbmfwikczt`, cuenta `nstrulesgames`) las migraciones iniciales: 18 tablas con RLS, 60 productos, 37 elementos de inventario, stock cero, cero usuarios y cero ventas.
- `anon` y `authenticated` no tienen USAGE en el esquema privado `flamingo`.
- `npm test`: 39 pruebas correctas, cero fallos, después de configurar la CA de Supabase y validar TLS.
- `npm run check`: correcto después de todos los cambios.
- PostgreSQL probado mediante PGlite y rol limitado: alta real, autenticación, catálogo, pagos y stock atómicos, doble envío, stock insuficiente con rollback, anulación, conteo ciego, reconteos, aprobación idempotente, roles actuales, reportes en horario boliviano, HTTP y exportación consistente.
- PGlite serializa el pool en una sola sesión. También se probaron dos conexiones reales a Supabase: el bloqueo de caja impide adquirirlo simultáneamente y lo libera al finalizar la transacción. Se verificó que el rol limitado puede insertar ventas y no puede borrarlas ni crear objetos en el esquema.
- Asesor de seguridad sin hallazgos sobre las tablas nuevas. Advertencia existente de Supabase Auth documentada en `SUPABASE.md`; el POS usa su propia autenticación.
- Ejecutados `db:configure` y `db:check`: conexión válida con rol `flamingo_runtime_*`. Servidor iniciado con `npm start`, sesión 54368. `/api/status` responde `setup:false`, `demo:false`, `database:postgres`; en el navegador aparece el formulario de alta del propietario. Captura: `test-results/supabase-setup.png`. Usuarios y ventas de demostración no se importaron.
- `npm run backup` creó un respaldo consistente real de PostgreSQL en `data/backups/flamingo-postgres-2026-10-06T15-14-56-476Z.json`.
- La exportación PostgreSQL JSON está probada; la restauración completa no está automatizada ni validada. El acceso móvil fuera de la red local requiere hosting HTTPS.

Actualización: 5 de octubre de 2026. Todas las operaciones manuales se hicieron en la base **de demostración**. Las secciones posteriores conservan las verificaciones de versiones anteriores.

## Comprobaciones automáticas

- `npm run check`: correcto.
- `npm test`: 31 pruebas correctas, 0 fallos.
- `npm run backup -- --demo`: creó un respaldo consistente sin detener el servidor.

Los casos de prueba están en `tests/store.test.js`: configuración inicial real sin stock ficticio, login/logout, aislamiento por rol, apertura de turno, precios del servidor, redondeo en centavos, efectivo y vuelto, pagos mixtos, reintento idempotente, consumo combinado de ingredientes, rollback por stock insuficiente, reposición, merma, conteo completo, rechazo de arqueo desactualizado, notas de diferencias, anulación con receta histórica, cambio de cajero, informe con fecha Bolivia, revocación de sesión, persistencia al reiniciar y controles HTTP.

`tests/reconciliation.test.js` añade permisos de declaración/aprobación, bloqueo de operaciones durante el conteo y revisión, ocultación de saldos por API, declaraciones inmutables e idempotentes, reconteos versionados, rechazo de aprobaciones antiguas, ajustes únicos, confirmación de inventario inicial, migración de cierres históricos y flujo HTTP entre trabajador y propietario.

`tests/menu.test.js` verifica las 60 variantes, precios y agrupación en 33 tarjetas, búsquedas sin acentos, stock compartido de escarchas, reservas entre variantes, rollback por sobreventa, reintentos sin duplicar descuentos, preparados pendientes, recetas por porciones, modo explícito sin stock, saldo cero en configuración real y migración que conserva ventas, cierres y ediciones del propietario. Las pruebas anteriores usan explícitamente el catálogo antiguo para conservar sus casos de regresión.

## Menú real y formato celular — 5 de octubre

- 390 × 844: venta como Camila, recepción de 37 saldos, escarcha grande de maracuyá (Bs 10), Coca-Cola 300 ml (Bs 5) y bolo de leche de chocolate (Bs 4). Total Bs 19, recibido Bs 20, vuelto Bs 1. Comprobante #0004.
- Conteo independiente de 37 existencias y Bs 119. La mezcla se declaró como 17 litros y se guardó como 17000 ml. Todos los saldos coincidieron; la propietaria aprobó y cerró el turno #004.
- Reposición manual de 1,5 litros de maracuyá: pasó de 17 a 18,5 litros. El inventario de botellas y bolos conservó sus unidades.
- 360 × 780: historiales en tarjetas, inventario, configuración de recetas y revisión del arqueo sin desplazamiento horizontal de página.
- 844 × 390: selección de botellas en una sola acción, diálogo dentro de la altura disponible y composición de celular centrada.
- Propietaria: aviso de 11 recetas pendientes y acceso a configurarlas. No se inventaron cantidades de ingredientes.
- Corregidos durante la prueba: conversión aplicada exclusivamente a las declaraciones líquidas, apertura con cantidades base originales, acceso al pedido mediante diálogo nativo, formato de existencias en reposición y respeto de atributos `hidden`.

Capturas: `test-results/mobile-menu.png`, `mobile-variants.png`, `mobile-order.png`, `mobile-count.png` y `mobile-admin.png`. La emulación no verifica teclado virtual ni respuesta táctil de iOS/Android; queda pendiente validarlo en un teléfono físico. Se creó respaldo del demo antes de importar el catálogo. No se modificó una base real.

## Flujo manual en navegador

1. Ingreso como propietario de demostración.
2. Apertura de turno con Bs 100.
3. Venta de hamburguesa clásica y Coca-Cola: Bs 30; recibido Bs 50; vuelto Bs 20. Comprobante generado y stock descontado.
4. Venta desde celular de una Sprite por Bs 8 con QR, marcado manualmente como recibido. Comprobante generado.
5. Resumen móvil: Bs 38 vendidos, 2 tickets, Bs 19 promedio, Bs 30 efectivo y Bs 8 digitales.
6. Arqueo completo con conteos simulados para la prueba y Bs 130 en efectivo. Cierre correcto, diferencia cero y turno registrado en historial.
7. Orden de ejemplo de Bs 42 agregada al carrito sin cobrar para explorar la interfaz.

## Pantallas

- 390 × 844: catálogo, carrito que ocupa la pantalla, cobro QR, resumen del propietario y cierre de turno.
- 360 × 800: verificación de ancho de celular pequeño sin desbordamiento horizontal del documento.
- 768 × 1024: tablet vertical, catálogo de dos columnas y orden a la derecha.
- 1024 × 768: tablet horizontal, catálogo y orden visibles simultáneamente.
- 1280 × 900: escritorio con navegación lateral completa.
- No se observaron errores de consola en la revisión final.

Capturas locales: `test-results/pos-desktop.jpg`, `test-results/pos-tablet.jpg` y `test-results/mobile-dashboard.jpg`.

## Límites de esta verificación

No se publicaron servicios en Internet. No se probaron bancos, terminales, impresoras físicas, redes móviles reales ni datos de producción. La recuperación de operaciones está respaldada por idempotencia en las pruebas del servidor y almacenamiento de solicitud en el cliente; no se realizó una prueba de corte físico de red. La demostración es una validación funcional, no una certificación fiscal ni una auditoría de seguridad externa.

## Arqueo independiente: verificación completada el 4 de octubre de 2026

- Recepción del inventario y apertura como Camila; inicio de conteo y bloqueo de operaciones.
- Formulario independiente sin saldo esperado; borrador recuperado después de recargar, conservando una declaración simulada de Bs 95 y 32 botellas de Coca-Cola.
- Primera declaración recibida por Valentina: el sistema conservó Bs 100 y 34 botellas esperadas. Diferencias visibles de Bs −5 y −2 botellas, sin ajustar stock.
- Solicitud de reconteo con motivo. Segunda versión enviada por Camila con Bs 100 y 34 botellas, explicando la corrección simulada.
- Aprobación de la versión 2 por Valentina. Turno #2 cerrado, diferencias cero y ambas declaraciones conservadas con autor y fecha.
- La sesión y el servidor se reiniciaron entre el pedido de reconteo y la segunda declaración; el flujo persistido pudo retomarse.
- Evidencia local: `test-results/arqueo-aprobado.jpg`. Las operaciones son exclusivamente de demostración.
# Actualización de interfaz · 5 de octubre de 2026

Aplicadas las instrucciones consultadas de Impeccable y Emil Kowalski, documentadas en `DESIGN.md`. Se conservaron autenticación, roles, reglas de inventario y APIs transaccionales. `glass.css` es una capa de presentación local, sin dependencias externas.

| Antes | Después | Motivo |
| --- | --- | --- |
| Banner antes del catálogo | Productos y búsqueda como contenido principal | Menos desplazamiento en cada venta |
| Redibujado del catálogo en cada pulsación | Actualización de cantidad y selección sobre el mismo botón | Conservar foco y responder de inmediato |
| Conteo en lista con scroll interno | Un solo scroll, búsqueda, pendientes y avance con Enter | Facilitar el conteo en tablet y celular |
| Comparación de todos los insumos en tabla ancha | Diferencias primero y coincidencias desplegables | Revisar desde el celular sin desplazar columnas |
| Inicio del propietario en venta | Resumen, estado actual de caja y acceso directo al arqueo | Priorizar supervisión del negocio |

Validación manual en la base de demostración:
- Camila abrió turno #3 con fondo Bs 100; vendió una Clásica Flamingo y una Coca-Cola por Bs 30; recibió Bs 50 y el comprobante registró Bs 20 de vuelto.
- Conteo: cero explícito válido, filtro de pendientes, búsqueda, restauración de borrador al reabrir, avance con Enter y progreso 0–14. Al enviar con campos ocultos sin completar, la validación los mostró y enfocó el primer faltante.
- Declaración v1 simuló una unidad de agua faltante; el propietario vio esa diferencia primero y pidió reconteo. La v2 empezó vacía, corrigió el agua a 35, declaró Bs 130, se revisó y aprobó sin diferencias. Ambas versiones permanecen en el historial; no se modificó la base del negocio real.
- Rango de siete días incluyó las tres ventas de demo (Bs 68) y el estado actual mostró caja cerrada después de aprobar. Probado el cambio de día en Bolivia durante esta sesión.
- Sin desborde horizontal de página a 360, 390, 768, 1024 y 1440px. Conteo adaptado a celular y carrito lateral en ambas orientaciones de tablet. Inputs de 16px, botones de cantidad de 44px, cifras tabulares, foco visible y reducción de movimiento/transparencia.
- `npm run check` y las 25 pruebas de `npm test` pasan. No se añadieron pruebas que solo reproduzcan el CSS.

Evidencia en `test-results/glass-arqueo-mobile.jpg`, `glass-admin-mobile.jpg`, `glass-pos-tablet-portrait.jpg`, `glass-pos-tablet.jpg` y `glass-pos-desktop.jpg`. Las capturas contienen datos de prueba. Pendiente prueba de teclado virtual y respuesta táctil en hardware iOS/Android; la emulación de viewport no verifica esos comportamientos.

# Adaptación para Vercel — 6 de octubre de 2026

Las 44 pruebas automatizadas pasan, incluidas cinco pruebas HTTP del adaptador: falta de conexión con respuesta 503, inicialización compartida entre peticiones simultáneas, cookies Secure, bloqueo del alta inicial incluso desde loopback y recuperación después de un fallo transitorio sin revelar mensajes del driver. La entrada alojada también respondió HTTP 200 con `database: postgres` usando Supabase real, sin modificar datos del negocio.

`vercel build --prod` generó el frontend estático y una función Node.js 24 para `/api/*`. El paquete excluye `.env*` y `data/`; el certificado público figura en `filePathMap`, que Vercel incorpora al desplegar. El arranque local y la carga de archivos de entorno están separados en `start.js`.

## Tipografía y flujos móviles · 6 de octubre de 2026

- `npm run check`, `git diff --check` y las 51 pruebas automatizadas pasan. El contrato de estado anuncia si el alta inicial está permitida; el bloqueo de Vercel conserva su prueba HTTP.
- Demostración SQLite separada en puerto 3001: turno #5 con fondo Bs 100, una Coca-Cola 300 ml por Bs 5, recibidos Bs 20 y vuelto Bs 15. Declaración de 37 insumos y Bs 105; revisión y aprobación sin diferencias. Ninguna de estas operaciones modificó Supabase.
- Conteo a 320px: filtro de pendientes, progreso 1/37 y borrador conservado al cerrar y reabrir. Controles numéricos de 18px y títulos del formulario enfocados al abrir.
- Resumen sin desbordamiento horizontal de página a 320, 390, 480 y 768px; a 768px la composición conserva 480px. Gráfico con desplazamiento interno y etiquetas de 12px. Perfil de 44px sin salir de la cabecera estrecha.
- Mostrar/Ocultar cambia el tipo de campo y aria-pressed; perfil abre Más opciones y conserva la sesión. Pago con estados aria-pressed. Evidencia de catálogo en `test-results/ui-mobile-oct06.jpg`.
- Contraste medido: texto blanco del acceso sobre rojo 4,82:1, botones primarios 5,71:1 y detalle del catálogo 6,69:1. La copia secundaria del acceso se corrigió de 3,58:1 a 4,82:1.
- Falta prueba física del teclado virtual y tacto en iOS/Android: se verificó foco DOM y tamaños de viewport, que no equivalen a hardware real.

