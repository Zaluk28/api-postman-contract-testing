# Orders API - Pruebas funcionales y de contrato con Postman

Proyecto individual preparado para demostrar reglas funcionales y contrato de una API mediante una colección automatizada de Postman.

## Contenido

- `app/`: API local de pedidos, sin dependencias externas.
- `openapi/openapi.json`: especificación OpenAPI 3.1.0.
- `matrix/test_matrix.csv` y `matrix/test_matrix.md`: 14 casos de prueba.
- `postman/Orders_API.postman_collection.json`: colección Postman v2.1 con IDs de la matriz.
- `postman/Local.postman_environment.json`: ambiente local exportable sin secretos.
- `evidence/`: verificación técnica local, guía para capturar evidencia real de Postman y fallo controlado.
- `video/video_script.md`: guion sugerido de máximo 3 minutos.
- `docs/AI_USAGE.md`: declaración de uso responsable de IA.
- `scripts/local_verify.js`: verificador local adicional; no sustituye la ejecución en Postman.

## Requisitos y versiones

- Node.js >= 20. La preparación local fue verificada con Node.js v22.16.0.
- OpenAPI: 3.1.0.
- Formato de colección: Postman Collection v2.1.0 JSON.
- Postman Desktop reciente o Postman CLI reciente.

Registre antes de entregar la versión exacta de Postman Desktop o el resultado de `postman --version` en su evidencia.

## Preparación reproducible

La API mantiene datos únicamente en memoria. Cada reinicio deja el estado limpio. La colección genera usuarios, contraseñas, tokens e IDs durante la ejecución; no depende de IDs de una ejecución anterior y el ambiente exportado no contiene secretos.

### 1. Iniciar la API

Desde la raíz del proyecto:

```bash
node app/server.js
```

Debe aparecer:

```text
Orders API listening at http://127.0.0.1:3000
CONTRACT_BREAK=0
```

Compruebe `http://127.0.0.1:3000/health` si necesita verificar que está activa.

### 2. Importar en Postman

Importe:

- `postman/Orders_API.postman_collection.json`
- `postman/Local.postman_environment.json`

Seleccione el ambiente **Orders API - Local (example, no secrets)**.

### 3. Ejecutar con Collection Runner

1. Abra la colección.
2. Pulse **Run**.
3. Tipo de ejecución: funcional/local.
4. Seleccione el ambiente local.
5. Ejecute la colección completa en el orden definido.
6. Verifique que se ejecutan los casos TC-001 a TC-014. TC-014 usa tres solicitudes para demostrar el efecto final idempotente.

### 4. Ejecutar con Postman CLI

```bash
postman collection run postman/Orders_API.postman_collection.json \
  --environment postman/Local.postman_environment.json
```

La ejecución es contra archivos locales y no requiere publicar la colección en Postman Cloud.

## Casos cubiertos

La matriz contiene 14 casos distintos y cubre:

- solicitud válida y verificación posterior del cambio;
- datos inválidos y campos obligatorios;
- ausencia de credenciales;
- credencial inválida;
- acceso a recurso ajeno;
- recurso inexistente;
- paginación;
- operación idempotente repetida y validación de su efecto final;
- esquemas de respuesta de éxito y error.

## Idempotencia

La operación documentada es:

```text
PUT /orders/{id}/confirm
```

La primera llamada cambia el pedido a `confirmed` y fija `confirmedAt`. Al repetir exactamente la misma operación, el estado sigue siendo `confirmed` y `confirmedAt` no cambia. TC-014 ejecuta dos PUT y una consulta final para comprobar el efecto, no solamente que las respuestas sean parecidas.

## Esquemas: cuerpo vs. OpenAPI completo

Las pruebas `jsonSchema` de la colección validan la **estructura del cuerpo JSON** correspondiente. Esto no se presenta como una validación completa de OpenAPI. Una validación completa de OpenAPI también debe considerar, entre otros aspectos, parámetros, seguridad, códigos de estado, headers, `Content-Type`, request bodies y todas las respuestas documentadas.

La colección prueba por separado varios de esos elementos mediante aserciones de código HTTP, autenticación, reglas de negocio y parámetros.

## Incompatibilidad controlada

Se incluyó un modo local que contradice intencionalmente el esquema `Order`. Con el modo activo, `GET /orders/{id}` omite el campo obligatorio `status` mientras el pedido aún está en estado `created`.

### Ejecución con defecto

Linux/macOS:

```bash
CONTRACT_BREAK=1 node app/server.js
```

PowerShell:

```powershell
$env:CONTRACT_BREAK="1"
node app/server.js
```

Ejecute la colección. El caso **TC-010 - body schema contract** debe fallar. Conserve una captura legible del Runner o del Postman CLI.

### Corrección

Detenga la API y vuelva a iniciarla sin `CONTRACT_BREAK`:

```bash
node app/server.js
```

En PowerShell, antes de iniciar:

```powershell
Remove-Item Env:CONTRACT_BREAK -ErrorAction SilentlyContinue
node app/server.js
```

Repita la colección y conserve la evidencia del resultado satisfactorio. No cambie el esquema para hacer pasar el defecto.

## Evidencia local incluida

Los archivos `evidence/local_verification_expected_fail.txt` y `evidence/local_verification_pass.txt` demuestran que la aplicación preparada produce un fallo controlado y luego 14/14 casos correctos con el verificador adicional del repositorio.

**Importante:** estos logs son evidencia técnica auxiliar y no sustituyen la captura exigida de Collection Runner o Postman CLI. Antes de entregar, ejecute la colección real y agregue esa captura al PDF.

## Estado limpio

Para repetir desde un estado limpio:

1. Detenga `node app/server.js`.
2. Vuelva a iniciar la API.
3. Ejecute la colección completa.

Los usuarios e IDs cambian en cada ejecución y se crean dinámicamente.

## Seguridad de datos

- No hay tokens, contraseñas reales ni datos personales en el repositorio.
- Las credenciales de prueba se generan durante la ejecución.
- El ambiente exportado contiene valores sensibles vacíos.
- La aplicación solo escucha en `127.0.0.1`.

## Enlaces para entrega

Complete antes de generar/subir la versión final del PDF:

- Repositorio: `PENDIENTE_AGREGAR_URL_GITHUB`
- Video: `PENDIENTE_AGREGAR_URL_VIDEO`

## Limitación principal

La API y las pruebas son deliberadamente pequeñas y usan almacenamiento en memoria. No validan persistencia en base de datos, concurrencia real, rendimiento, expiración de tokens ni una implementación productiva de autenticación.
