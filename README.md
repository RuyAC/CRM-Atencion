# Atencion · SaaS para restaurantes

Guía vigente de despliegue y operación: [docs/PRODUCCION.md](docs/PRODUCCION.md). Resultados y límites de la verificación: [docs/VERIFICACION-LANZAMIENTO.md](docs/VERIFICACION-LANZAMIENTO.md). Las instrucciones siguientes describen el entorno local de demostración; sus contraseñas no deben usarse en producción.

# Atencion · Atención y menú digital para Mate bar

Versión local en español, con precios en bolivianos (Bs). Recrea el circuito observado de Atencion: QR por mesa, llamada al garzón, solicitud de cuenta, menú con fotos y videos y pantallas de atención en vivo.

## Abrir la aplicación

Abre **Iniciar Atencion.cmd** con doble clic. Mantén la ventana abierta durante el servicio. El equipo necesita Node.js 24 LTS o superior; las dependencias y la aplicación preparada ya están incluidas en este espacio de trabajo. El inicio conserva los datos y reconoce si el servidor ya está abierto.

- Administrador: http://localhost:3001/dashboard
- Crear cuenta de restaurante: http://localhost:3001/register
- Administración de Atencion: http://localhost:3001/saas
- Cliente, Mesa 01: http://localhost:3001/r/mate-bar/t/table-01
- Monitor: http://localhost:3001/tv/mate-bar
- Vista compacta para reloj: http://localhost:3001/tv/mate-bar/watch

Los enlaces de mesa anteriores corresponden a la configuración inicial. Después de regenerar un QR o cambiar el identificador del restaurante, usa los enlaces actuales de **Mesas**.

## Accesos iniciales

Los accesos están separados: `ventas@matebar.com` administra Mate bar en `/dashboard`; `admin@local.test` administra únicamente Atencion en `/saas`. La cuenta SaaS no pertenece al equipo, no aparece como cliente y no permite operar el restaurante ni usar un PIN. Para cambiar de cuenta, abre **Entrar al restaurante** y usa sus credenciales. El panel SaaS incluye Resumen, Cuentas, Restaurantes y Actividad, con datos reales de todos los restaurantes registrados localmente. Las suscripciones mensuales y anuales se activan manualmente desde Restaurantes, con vencimiento y límites por plan. Los pagos se reciben fuera de la aplicación.

| Perfil | Correo | Contraseña | PIN |
|---|---|---|---|
| Cliente propietario de Mate bar | ventas@matebar.com | Atencion2026! | 1234 |
| Administrador de Atencion | admin@local.test | Atencion2026! | Sin PIN |
| Gerente | gerente@local.test | Gerente2026! | 2345 |
| Garzón | garcom@local.test | Garcom2026! | 3456 |

PIN general del monitor: **1234**. El PIN permite operar el monitor; para administrar se entra con correo y contraseña. Puedes cambiar contraseñas en **Configuración → Seguridad** y credenciales del equipo en **Equipo**. Son accesos de demostración para esta instalación.

La separación conserva la contraseña y el PIN que ya tenía Mate bar; si cambiaste su contraseña, sigue vigente y también se conservó como contraseña inicial del acceso SaaS separado. Cambiar la contraseña del restaurante después de la separación no modifica la cuenta SaaS. Las sesiones antiguas del propietario se cierran una vez para que vuelvas a entrar con el correo correspondiente.

## Registrar un restaurante

En el login pulsa **Crear cuenta para mi restaurante**. El formulario solicita nombre del restaurante, propietario, correo y contraseña con confirmación. El correo debe ser único y la contraseña tener al menos ocho caracteres. La cuenta se crea inmediatamente, inicia sesión y presenta un PIN aleatorio para el monitor; no se envían correos de verificación.

Cada restaurante empieza con cinco mesas y sus QR, los tres botones de atención, moneda Bs y menú vacío. Puede modificar estos datos en su panel. Su menú, equipo, llamadas, redes, ajustes, archivos y eventos en vivo se mantienen separados de los demás restaurantes. Los nombres iguales reciben enlaces distintos. El SaaS muestra el nuevo negocio, propietario y fecha real de registro.

El registro funciona en esta instalación local y en los dispositivos que alcanzan su servidor. No publica el servicio en internet, activa planes ni procesa pagos.

## Usar teléfonos, tablet o televisor

1. Conecta los dispositivos a la misma red del equipo que ejecuta Atencion.
2. En **Mesas → Dirección para los teléfonos**, elige la dirección de red detectada, por ejemplo `http://servidor.local:3001`, y guarda.
3. Abre primero esa dirección en un teléfono para comprobar que alcanza el equipo. Si no abre, revisa la red, el aislamiento de clientes del router y el permiso de acceso de Node.js en el firewall de Windows.
4. Descarga o imprime los QR. Ya apuntarán a esa dirección.
5. En la tablet o televisor abre esa dirección seguida de `/tv/mate-bar` e introduce el PIN.

`localhost` sirve solo en el propio equipo; un QR con localhost no conecta el teléfono al restaurante. Conviene reservar la IP del equipo en el router para que los impresos sigan sirviendo. El equipo debe permanecer encendido y conectado. La aplicación no necesita internet para atención, datos ni fotos locales; las imágenes enlazadas a otros sitios y el mapa/búsqueda de direcciones sí lo necesitan.

## Redes autorizadas

En **Redes autorizadas (Wi-Fi)**, la página reproduce el panel oscuro de conexión actual y las fichas de redes de la captura de Atencion. Consulta la IP pública mediante ipify desde el navegador; requiere internet y no obtiene el nombre Wi-Fi ni su contraseña. **Registrar esta red** y **Guardar esta IP ahora** guardan la conexión directamente con el nombre «Wi-Fi del restaurante». **Registrar manualmente** abre el formulario; pulsa el nombre de una red para editarlo. Cada ficha permite activar/desactivar y eliminar con confirmación.

Si hay una sola red local física disponible, el registro directo también la autoriza, según la elección del usuario. Con varias interfaces, se guarda la IP pública y puedes elegir la red local al editar. Esa autorización se guarda por separado y permite validar los dispositivos que llegan al servidor desde esa misma subred. Las interfaces virtuales conocidas, como WSL o VPN, se excluyen de la selección; el nombre del adaptador no garantiza identificar una VPN renombrada. La detección no cambia el modo de presencia: actívalo en Configuración cuando quieras exigir esa validación.

Las fechas de alta y actualización se registran en el servidor al guardar. Los registros antiguos sin fecha muestran «Fecha no registrada» hasta su próxima modificación.

Si la consulta pública falla, puedes reintentar o registrar una IP manualmente. La atención local continúa funcionando sin internet. No se utiliza una IP declarada por el cliente para autorizarlo.

## Funciones

- **Mesa:** llamar, pedir la cuenta, cancelar mientras espera y convertir una llamada pendiente en cuenta. El cliente ve cuándo se acepta y cuándo se finaliza. Consultar el menú no genera una llamada.
- **Menú:** categorías, búsqueda, destacados, etiquetas, precio promocional, disponibilidad, fotos y video en fichas verticales. Imágenes de hasta 5 MB y videos de hasta 10 MB; el formato reproducible depende del navegador. El video se puede reproducir con controles y se respeta el movimiento reducido.
- **Dashboard y monitor:** colas en vivo, aceptación y finalización, historial, sonido, pantalla completa, tema claro/oscuro, modo táctil y modo pasivo configurable.
- **Mesas:** alta, edición, baja, activación, enlace propio, QR PNG/SVG, display imprimible de 10 × 15 cm, personalización y rotación para invalidar enlaces anteriores.
- **Equipo:** fichas de miembros y permisos Owner, Manager y Staff; formulario con generadores de contraseña y PIN, mostrar/ocultar PIN, cambio de contraseña, cambio de función y eliminación confirmada. Las contraseñas de miembros tienen un mínimo de 6 caracteres y el PIN del salón tiene exactamente 4 dígitos. Cambiar credenciales o función invalida las sesiones anteriores. La creación de miembros crea credenciales locales; no envía correos.
- **Configuración:** marca, color, logo, portada, textos, moneda, zona horaria, pausas, horarios, presencia por IP/GPS, sesión de presencia y reglas del monitor.
- **Botones:** acciones de llamada, menú, cuenta y enlaces externos.
- **Reportes:** períodos, esperas, tipos de llamada, movimiento por mesa, historial, CSV e impresión/PDF desde el navegador.
- **Cocina:** comandas creadas por el equipo y avance por preparar, en preparación, listo y entregado. Es una implementación propia de la función anunciada en el plan Business; su pantalla no se observó en la prueba original.

Una mesa conserva una sola solicitud activa. Dos personas que aceptan simultáneamente reciben un único resultado válido. El servidor conserva datos en SQLite y actualiza todas las pantallas por una conexión de eventos en vivo.

## Datos y respaldos

Mate bar y el registro de plataforma quedan en `data/atencion.sqlite`, con su clave en `data/atencion.sqlite.key`. Cada restaurante nuevo tiene su propia base y clave en `data/tenants`, y sus archivos dentro de un subdirectorio propio de `public/uploads`. Nunca elimines esas carpetas para reiniciar la aplicación.

La opción **Descargar respaldo** exporta configuración, menú, mesas, equipo, credenciales y solicitudes del restaurante en JSON y requiere una cuenta propietaria del restaurante. Incluye los PIN y los verificadores de contraseñas: conserva ese archivo de forma privada. Para una copia completa del equipo, detén el servidor y copia las carpetas `data` y `public/uploads` junto con el proyecto. Los archivos multimedia no se incluyen en el JSON. La restauración sustituye los registros del restaurante, conserva al menos un propietario activo y exige volver a iniciar sesión en el restaurante. La identidad, contraseña, permisos y sesiones SaaS permanecen separados y no se transfieren ni sustituyen mediante el respaldo JSON.

Los platos y fotografías iniciales son demostrativos: reemplázalos por la carta y material de Mate bar. Su origen está registrado en `public/assets/provenance.json` y dentro de cada fotografía.

## Alcance de la recreación

La investigación y sus capturas se conservan en `investigacion/ATENCION-investigacion.md`. El diseño sigue las pantallas observadas y adapta idioma y marca según el pedido. No se certifica igualdad exacta de píxeles en toda la plataforma; algunas funciones del plan no pudieron inspeccionarse.

La pantalla de suscripción documenta la referencia original; la versión local tiene las funciones habilitadas y no realiza cobros. Pedir la cuenta envía un aviso y no procesa pagos. Las notificaciones son del navegador mientras el monitor está abierto; no se implementa un servicio externo de push con la aplicación cerrada.

Sonido, pantalla completa, vibración, instalación, GPS y NFC dependen del dispositivo, permisos y navegador. GPS/NFC e instalación suelen exigir HTTPS fuera de localhost. En una red local HTTP se puede usar modo básico o validación por IP. La vista de reloj es una página compacta para navegador; no es una aplicación nativa de smartwatch. Esas funciones requieren una comprobación final en el hardware del restaurante.

## Desarrollo y verificación

```text
npm install        # Solo si se trasladó el proyecto sin dependencias
npm run dev        # Interfaz de desarrollo y servidor local
npm run build      # Prepara la interfaz de producción
npm start          # Servidor en el puerto 3001
npm test           # Pruebas del servidor con datos aislados
node scripts/verify-ui.mjs
node scripts/verify-workflows.mjs
node scripts/verify-accessibility.mjs
node scripts/verify-networks.mjs
node tests/network-timeout.ui.mjs
node scripts/verify-staff.mjs
node scripts/verify-sidebar.mjs
node scripts/verify-tutorial.mjs
node scripts/verify-saas.mjs
node scripts/verify-account-separation.mjs
node scripts/verify-registration.mjs
node scripts/verify-product-editor.mjs
```

Las verificaciones de navegador requieren Playwright y Microsoft Edge. Los resultados y capturas están en `.impeccable/review`. Puedes configurar `PLAYWRIGHT_MODULE` si tu instalación de Playwright está en otra ruta. No se ha publicado ni enviado código a un servicio remoto.

La barra lateral utiliza un único componente en las diez secciones del administrador. `verify-sidebar.mjs` comprueba la misma composición, selección, permisos y navegación en escritorio y móvil con datos aislados. Las medidas de la barra registradas por la prueba histórica de Equipo corresponden al diseño anterior; la evidencia vigente está en `.impeccable/review/sidebar-unified`.

**Tutorial del sistema** abre el recorrido de siete pasos desde la barra lateral, reproducido según las siete capturas del original en español para Mate bar. El cierre presenta equipo y reportes, enlaza «Ver equipo» y termina con el botón verde «Comenzar a usar». Los botones del recorrido abren las secciones reales permitidas para cada perfil. La evidencia y las pruebas aisladas están en `.impeccable/review/tutorial-reference`.

**Nuevo producto / Editar producto** reproduce el formulario de las referencias: información y estudio de medios en dos columnas, promoción con ahorro, etiquetas, destacado, foto y video con vista previa vertical, carga de archivos o enlace y consejos desplegables. El pie con Cancelar y Guardar permanece disponible mientras se desplaza el contenido. La moneda usa la configuración del restaurante y se conserva la disponibilidad del producto al editarlo.
