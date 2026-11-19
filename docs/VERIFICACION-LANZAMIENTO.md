# Verificación de lanzamiento · 20 de octubre de 2026

Implementación local terminada y comprobada. No se ha desplegado ni contratado infraestructura.

## Resultados

- Compilación de producción Vite: correcta.
- `node --test tests/*.test.mjs`: 97 pruebas aprobadas, cero fallos.
- `node scripts/verify-launch-ui.mjs`: seis recorridos aprobados en Edge, sin errores JavaScript.
- `node scripts/verify-product-ui.mjs`: ocho recorridos adicionales aprobados: demo aislada, contacto y gestión comercial, alta limpia, límites visibles, solicitud de activación, ayuda con teclado, limpieza con confirmación y diseño móvil público/panel.
- Verificadas páginas públicas a 320 y 390 px y panel del restaurante a 390 px, sin desbordamiento horizontal.
- `node scripts/benchmark-local.mjs`: cinco restaurantes temporales, 375 peticiones, hasta 30 concurrentes, cero errores. Latencia mediana 30,84 ms; p95 105,56 ms; máximo 114,02 ms en esta ejecución local.
- `node scripts/check-release.mjs` informa correctamente los datos comerciales y de infraestructura pendientes; no se presenta como publicación aprobada.
- Registro con Pro anual y activación pendiente; activación y vencimiento desde administración SaaS; precios reales en el panel.
- Solicitud real, rechazo de doble aceptación, desconexión y reconexión, finalización de atención.
- Recuperación de contraseña con transporte de correo simulado, cambio efectivo y cierre de sesiones.
- Precios anuales, comparador y ancho móvil de 390 px sin desbordamiento horizontal.
- Creación y verificación de respaldo completo desde el panel SaaS.

Las pruebas nuevas incluyen privacidad de solicitudes comerciales, estados auditados, registro de consentimiento legal, limpieza conservadora de medios, retención de respaldos verificados y alertas simuladas por caída, disco y antigüedad de copias locales/externas. Las pruebas del servidor incluyen aislamiento entre restaurantes, permisos de activación, límites por plan, vencimiento y gracia, verificación de correo en producción, tokens de un solo uso, restauración de bases/claves/archivos y rechazo de respaldos alterados. Se corrigieron durante la verificación la reconexión del flujo de eventos y la lectura del token de recuperación durante el montaje de React.

Capturas y resultados: `.impeccable/review/launch/` y `.impeccable/review/product/`. Las pruebas usan datos temporales independientes de los restaurantes existentes.

## Validación pendiente en infraestructura real

Docker no está disponible en este equipo: la imagen, Compose, Caddy y restic están preparados, pero no se ejecutaron aquí. Deben comprobarse en el servidor de destino siguiendo PRODUCCION.md.

Faltan dominio y DNS reales, credenciales de envío y validación SPF/DKIM, repositorio externo de respaldos y sus credenciales, identidad y condiciones legales del proveedor. No se enviaron correos reales ni copias a servicios externos. Los pagos y las renovaciones son manuales; no existe cobro automático ni facturación fiscal integrada.

Antes del primer cliente, realizar una restauración desde la copia externa y un piloto con teléfonos, monitor, sonido y conexión del restaurante. La prueba HTTP local es una referencia controlada; no mide el hardware o la red del VPS ni certifica una cantidad de clientes simultáneos. El monitoreo está implementado, pero su contenedor y la entrega real de alertas deben verificarse en infraestructura.

## Revisión de producto

Marca Atencion unificada en paneles, acceso, correos, manifiesto e iconos; formatos internos de respaldo y nombres de variables se mantienen compatibles. La demo pública vive en /demo y no hace POST. Contacto, ayuda, términos y privacidad se enlazan desde la landing. Los datos reales del proveedor quedan pendientes por indicación del propietario; los documentos no se publican como definitivos.

El backend local está disponible en el puerto 3001 y la vista previa 4173 reenvía /api y /uploads. Se comprobaron health, configuración pública y ruta de contacto con respuesta 200 en ambos puertos.

## Verificación de cuentas y entregas — 20 de octubre de 2026

Cinco recorridos adicionales de navegador aprobados: vinculación TOTP y descarga de recuperación, login con segundo factor, pago/anulación e historial del propietario, exportación/cancelación/retiro de baja y eliminación administrativa sobre datos temporales. Sumados a los seis de lanzamiento y ocho de producto: 19 recorridos, sin errores JavaScript. Resultados en .impeccable/review/accounts/results.json. Vista de cuenta a 390 px sin desbordamiento de página; las tablas tienen desplazamiento horizontal propio.

Pruebas del servidor: cifrado y rechazo de reutilización MFA, códigos de un uso, aislamiento de pagos/exportaciones, confirmaciones y plazo mínimo de siete días, limpieza física y reinicio después de baja, exclusión de archivos privados e integridad de entregas. No se activó MFA ni se eliminaron cuentas de la instalación real. Se corrigió la copia de public/uploads al build: solo se copian recursos estáticos autorizados.

Ver ACTUALIZACIONES.md para ensayo, actualización y recuperación. El doble factor real, Docker y las integraciones externas siguen pendientes de configuración y validación en destino.


Paquete local .impeccable/review/release-final: 59 archivos verificados con inventario SHA256. node scripts/verify-release-boot.mjs .impeccable/review/release-final confirmó arranque del servidor empaquetado, health, páginas y recurso estático usando una base temporal. No equivale a prueba de imagen Docker. Backend actualizado en 3001 y proxy 4173: health correcto después del reinicio.


## Demo gratis — 21/10/2026

99 pruebas del servidor aprobadas. Nuevas verificaciones: elección de plan/ciclo, siete días no alterables desde el registro, una mesa inicial, creación de mesas adicionales hasta el límite del plan, recepción de llamada, vencimiento sin gracia, activación de pago sin perder solicitudes y correo verificado en producción. scripts/verify-free-demo-ui.mjs verificó el CTA, registro Pro anual, una mesa, llamada real, aviso de demo y ancho móvil; sin errores JavaScript. Todas las cuentas de esta comprobación fueron temporales.

