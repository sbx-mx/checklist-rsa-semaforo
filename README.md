# RSA Digital 3.0

Checklist operativo ICA y semáforo RSA con base JSON, navegación limpia, borrador automático y respaldo de auditorías.

## Ejecutar con Python

```bash
python app.py
```

Abre `http://127.0.0.1:8000`. No requiere instalar dependencias.

La versión estática continúa siendo compatible con GitHub Pages. El navegador usa `data/checklist.json` cuando la API Python no está disponible.

## Validación

```bash
PYTHONPATH=. python -m unittest discover -s tests -v
node --check static/app.js
node --check sw.js
```

