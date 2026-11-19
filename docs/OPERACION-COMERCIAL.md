# AUnToque: venta, soporte y aceptación

Los datos reales del proveedor quedan pendientes por indicación del propietario. No se han inventado contactos, identidad, datos bancarios ni condiciones de devolución.

## Configuración comercial

Completar `deploy/.env` a partir de `deploy/env.example`:

| Variable | Contenido |
| --- | --- |
| BUSINESS_NAME / BUSINESS_ADDRESS | Identidad y domicilio del proveedor |
| BUSINESS_JURISDICTION | Jurisdicción aplicable acordada |
| SALES_EMAIL / SUPPORT_EMAIL | Contactos reales |
| BUSINESS_WHATSAPP | Número internacional, solo cifras |
| SUPPORT_HOURS | Horario y zona horaria |
| PAYMENT_INSTRUCTIONS | Instrucciones públicas del canal de pago acordado |
| CANCELLATION_POLICY | Condiciones de cancelación y devolución |
| PRIVACY_RETENTION | Plazos de conservación, eliminación y tratamiento de respaldos |
| LEGAL_VERSION | Identificador de la versión revisada |
| LEGAL_PUBLISHED | `true` solo después de completar y revisar los textos |

`/terminos` y `/privacidad` muestran un aviso de pendiente mientras falten campos. Al publicar, se exige en registro de producción aceptar la versión vigente y se conserva la aceptación con fecha. La plantilla requiere revisión del proveedor; completar variables no certifica su adecuación jurídica. Identificar también los encargados de infraestructura y sus países, impuestos y procedimiento para ejercer derechos en la documentación contractual final.

`node scripts/check-release.mjs` comprueba las variables de infraestructura y comerciales sin mostrar secretos. Hasta completar los datos del proveedor, debe informar pendientes. No ejecutarlo como sustituto del ensayo de despliegue.

## Recorrido de venta

1. Compartir `/demo`. Es una simulación con datos ficticios y no escribe en el sistema operativo del restaurante.
2. Recibir solicitud en `/contacto`; aparece en la bandeja comercial de `/saas`. Revisar la bandeja diariamente. No se envían correos automáticos desde ese formulario.
3. Confirmar alcance, plan mensual/anual, condiciones, materiales y servicios adicionales. Marcar la solicitud como contactada después de contactar realmente al interesado.
4. El cliente crea su restaurante en `/register`: menú vacío, único propietario, PIN y tokens aleatorios y cinco mesas iniciales. En producción, la instalación principal también inicia sin platos ni mesas de demostración.
5. Recibir y verificar el pago fuera de la aplicación. No introducir credenciales bancarias ni tarjetas en mensajes. Emitir el comprobante por el procedimiento fiscal del proveedor.
6. En `/saas/restaurants`, abrir el restaurante, confirmar plan, período, vencimiento, gracia y referencia de pago. Activar después de verificar el pago. Revisar que el cliente vea la vigencia correcta en Suscripción.
7. Acompañar el checklist y el piloto. Marcar la solicitud como cerrada al concluir.

El cliente puede solicitar activación, renovación, cambio o ayuda desde Suscripción. El panel avisa cuando faltan menos de siete días o se ha vencido. Las fechas se confirman manualmente; no existe cobro automático, renovación automática ni emisión fiscal integrada.

## Soporte e incidentes

- Ayuda pública en `/ayuda`, accesible desde el panel. Cubre menú, QR, equipo, sonido, conectividad y renovación.
- Antes de solicitar detalles, identificar restaurante y momento del problema. Nunca pedir contraseñas ni PIN. Separar incidentes de conectividad, permisos, vigencia y errores del servicio.
- Ante caída: revisar HTTPS y health, logs de app/Caddy, disco y proceso; restaurar la disponibilidad y comprobar una llamada completa. Registrar causa, duración y medidas tomadas.
- Ante restauración: detener escrituras, conservar copia del estado actual y restaurar a una ubicación nueva; verificar integridad y aislamiento antes de cambiar la instancia activa.
- Ante solicitud de privacidad: verificar identidad por el canal del proveedor, determinar datos y obligaciones de conservación, responder y registrar la acción. No prometer eliminación inmediata de respaldos históricos. El propietario puede descargar sus datos, cancelar y solicitar eliminación desde Suscripción. La eliminación de datos activos requiere al menos siete días, confirmación de nombre y contraseña y ejecución por plataforma; las copias históricas y registros financieros conservan su política de retención.

## Almacenamiento

La administración SaaS dispone de vista previa y limpieza de archivos gestionados sin referencias actuales, con más de siete días. Se preservan archivos recientes, referenciados, carpetas de otros restaurantes, enlaces y nombres no gestionados. La limpieza vuelve a calcular referencias al ejecutarse y exige confirmación. Los respaldos completos conservan su propia copia de los archivos.

Después de cada respaldo válido, la retención local conserva como mínimo siete respaldos verificados y todos los de los últimos treinta días. Solo elimina carpetas de respaldos con nombre gestionado e inventario válido. Las copias incompletas o alteradas requieren revisión manual. La copia externa debe estar habilitada antes de operar con clientes.

## Acta del piloto real

Completar en el restaurante antes de abrir ventas generales:

| Comprobación | Resultado / evidencia |
| --- | --- |
| Fecha, responsable y restaurante | Pendiente |
| QR desde datos móviles y Wi-Fi | Pendiente |
| Teléfono Android y iPhone del cliente | Pendiente |
| Llamar, aceptar, finalizar y pedir cuenta | Pendiente |
| Dos garzones intentan aceptar simultáneamente | Pendiente |
| Monitor con sonido y pantalla activa | Pendiente |
| Cortar y recuperar conexión | Pendiente |
| Verificar correo y recuperar contraseña reales | Pendiente |
| Vigencia, pago y renovación visibles | Pendiente |
| Restaurar copia externa en otra instancia | Pendiente |
| Alertas recibidas durante fallo y recuperación | Pendiente |
| Condiciones y contacto del proveedor publicados | Pendiente |

No se ha ejecutado este piloto físico ni contratado servicios externos desde el entorno local.


## Pagos y seguridad de plataforma

Registrar el pago recibido en /saas/finance con referencia y período. El registro no activa el servicio: revisar y actualizar la suscripción por separado. Corregir errores mediante anulación con motivo; se conserva el pago original. El propietario ve únicamente sus pagos y puede descargarlos en CSV. Los vencimientos próximos y las solicitudes de baja aparecen en el mismo panel.

Configurar el doble factor en /saas/security antes de operar producción. Guardar los códigos de recuperación en un lugar seguro separado del servidor. Seguir ACTUALIZACIONES.md para cambios de versión y restauraciones, incluida la conciliación de cuentas eliminadas después de una copia antigua.


## Demo gratis desde la landing

El botón Demo gratis abre /register?demo=1. El cliente selecciona plan y ciclo y recibe una prueba de siete días con una mesa creada automáticamente y menú vacío. Todas las funciones y límites corresponden al plan elegido; se pueden agregar mesas hasta el límite del plan. No hay débito automático ni renovación de la prueba. En producción se requiere verificar el correo para atender. Al vencer se conserva el panel y los datos; la plataforma activa el plan pagado por el procedimiento habitual. El registro convencional mantiene su activación manual.

