# CA de PostgreSQL de Supabase

`supabase-ca.crt` es el certificado raíz público de Supabase usado para verificar el servidor PostgreSQL y su nombre. Se carga únicamente para endpoints oficiales de Supabase, o cuando el operador configura explícitamente `DATABASE_SSL_CA` para otra autoridad.

Fuente: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

SHA-256: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

Vence el 26 de abril de 2031. Revisar y actualizar desde la sección SSL Configuration del proyecto ante una rotación del proveedor. No contiene secretos.

Referencia: https://supabase.com/docs/guides/platform/ssl-enforcement
