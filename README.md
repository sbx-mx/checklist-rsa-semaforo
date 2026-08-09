# RSA Digital 3.1 · Ruta Verde

Checklist operativo ICA y semáforo RSA con recorrido guiado, prioridades operativas, borrador automático y respaldo discreto de auditorías.

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

## Limpieza segura

`python tools/cleanup_obsolete.py` muestra los residuos conocidos sin modificar nada. Usa `--apply` para confirmar localmente. En GitHub, el workflow **Limpiar archivos obsoletos** requiere activación manual y confirmación explícita antes de crear un commit.
