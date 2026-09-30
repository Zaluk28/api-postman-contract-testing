# Evidencia que debe capturarse en Postman

Antes de entregar, agregue al PDF capturas reales y legibles de:

1. **Ejecución satisfactoria:** Collection Runner o Postman CLI mostrando la colección completa y sin pruebas fallidas.
2. **Prueba negativa relevante:** por ejemplo TC-011 mostrando `403 FORBIDDEN` cuando user B intenta consultar el pedido de user A.
3. **Incompatibilidad controlada:** API iniciada con `CONTRACT_BREAK=1` y TC-010 fallando por el esquema del cuerpo.
4. **Corrección:** API iniciada normalmente y la misma prueba TC-010 pasando.

No use los logs del verificador auxiliar como si fueran capturas de Postman. Son evidencia adicional para comprobar que el proyecto fue preparado y revisado localmente.
