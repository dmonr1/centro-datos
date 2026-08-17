# Control de Acceso al Centro de Datos

Aplicacion web responsive/PWA para registrar ingresos y salidas al centro de datos. El proyecto esta separado en dos carpetas:

- `frontend/`: HTML, CSS y JavaScript sin framework.
- `backend/`: API Python con FastAPI, autenticacion preparada para LDAP/Directorio Activo y PostgreSQL.

El backend tambien sirve el frontend, asi que en despliegue puedes levantar solo Python en el puerto `8065`.

## Base de datos

La base esperada es PostgreSQL:

```properties
host=localhost
port=5432
database=cacd-dp
user=postgres
password=1234
```

Ejecuta el script:

```sql
backend/sql/schema.sql
```

Las firmas se guardan como `BYTEA`. Para firmas pequenas esta bien; para fotos o archivos pesados conviene guardar archivos en disco/Storage y dejar solo la ruta en PostgreSQL.

## Ejecutar en desarrollo

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

Luego abre:

```text
http://localhost:8065
```

Mientras `LDAP_ENABLED=false`, el login de prueba es:

```text
usuario: admin
clave: admin
```

## LDAP

Cuando tengas los datos del Directorio Activo, cambia `backend/.env`:

```env
AD_HOST=SERVIDOR_AD
AD_PORT=389
AD_DOMAIN=DOMINIO
AD_SEARCH_USER_BASE=DC=dominio,DC=local
AD_SEARCH_GROUP_BASE=OU=Grupos,DC=dominio,DC=local
AD_SECURE_LDAP=false
AD_VALIDATION_ENABLED=true
AD_SHOW_EXCEPTIONS=false
```

En produccion usa HTTPS y cambia `SECRET_KEY`.
