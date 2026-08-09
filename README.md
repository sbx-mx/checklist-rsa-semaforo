# RSA Digital 3.2 · Juntémonos más

Checklist operativo ICA y semáforo RSA con evaluación modal, evidencia en cualquier resultado, recorrido recuperable y exportación resumida de oportunidades.

## 10 mejoras de navegación

1. Instructivo breve en el inicio.
2. Un solo botón para abrir criterio, decisión y evidencia.
3. Ventana amplia que mantiene visible el contexto de la penalización.
4. Evidencia disponible también cuando el punto cumple.
5. Guardar y continuar lleva al siguiente punto prioritario.
6. Menú de áreas compacto con conteos según la vista activa.
7. Priorización por impacto en Semáforo Celebrar.
8. Modo Corregir con regreso directo al recorrido pendiente.
9. Mensaje accionable para recuperar el estado Celebrar.
10. Exportación con datos de auditoría y solo oportunidades.

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
