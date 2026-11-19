# Actualizaciones y recuperación

## Preparar una entrega

Usar Node 24. Ejecutar desde el proyecto:

```sh
node --test tests/*.test.mjs
node node_modules/vite/bin/vite.js build
node scripts/verify-launch-ui.mjs
node scripts/verify-product-ui.mjs
node scripts/verify-account-ui.mjs
node scripts/release.mjs prepare releases/2026-10-20-01
node scripts/release.mjs verify releases/2026-10-20-01
docker build -t auntoque:2026-10-20-01 releases/2026-10-20-01
```

Cada entrega usa una carpeta y una etiqueta nuevas. El inventario SHA256 detecta modificaciones accidentales; no es una firma de autenticidad. Verificar también la procedencia del paquete. La entrega excluye bases, claves, archivos de restaurantes y variables de entorno. El proceso rechaza compilaciones que incluyan `dist/uploads`.

## Ensayar antes de publicar

Usar una instalación de pruebas con dominio, credenciales, volúmenes y respaldos propios. No compartir los volúmenes de producción. Cargar datos ficticios o una copia anonimizada. Configurar HTTPS, correo de prueba y doble factor; comprobar registro, activación, QR desde móvil, llamada, atención, pagos, exportación y recuperación de contraseña. Verificar restauración y alertas. No abrir ventas hasta completar el piloto descrito en OPERACION-COMERCIAL.md.

## Actualizar producción

1. Registrar la etiqueta actual, la nueva etiqueta y el respaldo utilizado. Guardar la imagen anterior.
2. Crear y verificar un respaldo completo de bases, claves y archivos; comprobar su copia externa. Detener escrituras durante la copia final y el cambio.
3. Transferir y verificar el paquete. Construir la imagen con su etiqueta exclusiva o cargar una imagen procedente del proceso de entrega.
4. En `deploy/.env`, fijar `RELEASE_TAG` a la nueva etiqueta. Conservar las demás variables y volúmenes. Configurar `REQUIRE_PLATFORM_MFA=true`; cada administrador debe vincular su autenticador y guardar sus códigos de recuperación fuera del servidor.
5. Ejecutar `docker compose -f deploy/compose.yaml --profile monitoring up -d --no-build app monitor`. Para la instalación inicial y los servicios complementarios seguir PRODUCCION.md.
6. Comprobar estado de contenedores, `/api/health`, HTTPS, acceso, suscripción y una atención completa. Revisar errores y recepción de alertas antes de reabrir escrituras.

## Volver a la versión anterior

Si el esquema y los datos siguen siendo compatibles, restaurar la etiqueta anterior y recrear app/monitor con `--no-build`. No borrar volúmenes. Si hay incompatibilidad, conservar el estado fallido y restaurar el respaldo completo en una ubicación separada mediante `scripts/restore-full.mjs`; verificarlo antes de cambiar la instalación activa. La restauración pierde cambios posteriores al respaldo: registrar y conciliar pagos y operaciones afectados.

Un respaldo antiguo puede contener cuentas eliminadas posteriormente. Antes de reabrir una restauración, conciliar el registro de bajas posterior a la copia y volver a aplicar las eliminaciones correspondientes; no reactivar esas cuentas. Restringir el acceso a copias históricas y aplicar la política de conservación acordada.

Docker, HTTPS público, correo y almacenamiento externo deben validarse en la infraestructura de destino. La verificación local no acredita esas integraciones.
