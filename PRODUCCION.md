> Guía vigente: [docs/PRODUCCION.md](docs/PRODUCCION.md). Este documento conserva las instrucciones históricas del entorno local.

# Configuración segura de Atencion

La versión local conserva las cuentas y datos existentes. No debe exponerse una instalación de demostración directamente a Internet.

## Instalación nueva

Configurar en el entorno del servicio, antes de `npm start`:

- `NODE_ENV=production`.
- `ATENCION_PUBLIC_ORIGIN`: origen público HTTPS exacto, por ejemplo `https://atencion.example.com`, sin rutas.
- `ATENCION_RESTAURANT_NAME`: nombre del primer restaurante.
- `ATENCION_OWNER_PASSWORD`: contraseña propia de entre 16 y 200 caracteres.
- `ATENCION_ADMIN_PASSWORD`: otra contraseña de entre 16 y 200 caracteres, distinta de la del restaurante.
- `ATENCION_MONITOR_PIN`: PIN propio de entre 6 y 8 cifras.

Los secretos deben suministrarse mediante la configuración privada del servicio, nunca mediante archivos versionados. Las contraseñas de demostración se rechazan. El primer restaurante queda sin menú, mesas ni equipo de ejemplo. Los identificadores iniciales de acceso siguen siendo `ventas@matebar.com` para el propietario y `admin@local.test` para el administrador SaaS; sus contraseñas son las configuradas arriba.

Preparar la interfaz con `npm run build`. `PORT`, `HOST` y `DB_PATH` permiten elegir puerto, interfaz y SQLite. El proxy debe enviar las peticiones al servidor interno, que no debe ser accesible directamente desde Internet. El origen se compara con la configuración explícita; no se confía en cabeceras reenviadas arbitrarias. Las cookies de sesión y presencia llevan `Secure` con origen HTTPS. El control de IP/presencia detrás de proxies necesita una validación específica de la infraestructura: no se agregó confianza indiscriminada en `X-Forwarded-For`.

## Migrar datos locales

Respaldar primero las bases SQLite de todos los restaurantes, sus claves y los archivos subidos. Cambiar en modo local las contraseñas conocidas de todas las cuentas, incluida la del administrador SaaS, los PIN del equipo y el PIN general del monitor. Al iniciar producción se rechazan bases que todavía contienen credenciales de demostración. Las cuentas desactivadas también se comprueban. No borrar ni reinicializar la base para resolver este rechazo.

## Archivos y respaldos

La carga limita imágenes a 5 MB y videos a 10 MB. Comprueba la estructura básica de los contenedores MP4/MOV/WebM y aplica una cuota predeterminada de 1 GiB por restaurante; la opción interna `mediaQuotaBytes` permite ajustarla. Esto no sustituye el análisis antivirus, la transcodificación ni una comprobación completa de todos los códecs. La cuota cuenta archivos existentes, incluidos medios que ya no están enlazados desde productos.

Antes de una restauración válida en una base persistente se genera `backups/before-restore-*.json` junto a la base. Son copias sensibles con credenciales cifradas/hash y PIN recuperables: proteger la carpeta con permisos del sistema y definir retención. Los medios, claves y el inventario SaaS requieren además un respaldo completo del almacenamiento; el JSON de un restaurante no es recuperación total de la plataforma.

## Alcance

Estas medidas corrigen los defectos de QA; no completan pagos, cobros recurrentes, suspensión comercial, recuperación por correo ni supervisión operativa. El historial público de una mesa está acotado, pero el panel administrativo aún requiere trabajo adicional de paginación para grandes volúmenes.
