# Getting Started

## Requisitos

- Python 3
- Node.js para la documentación y suites browser-based
- navegador moderno

## Arranque rápido

```bash
python3 reportforge_server.py
```

Abrir:

- `http://127.0.0.1:PORT/`

El runtime canónico servido en `/` usa:

- [`designer/crystal-reports-designer-v4.html`](/home/mimi/Escritorio/RF/designer/crystal-reports-designer-v4.html)
- [`engines/*.js`](/home/mimi/Escritorio/RF/engines)

## Gates obligatorios antes de tocar runtime

```bash
npm run test:contracts
npm run test:governance
npm run test:runtime
```

## Flujo básico de uso

1. abrir el diseñador
2. insertar o arrastrar campos al canvas
3. seleccionar elementos
4. aplicar formato
5. ajustar layout y secciones
6. alternar entre design y preview

## Si vas a desarrollar

Antes de cambiar arquitectura:

- revisa [Architecture Overview](../architecture/overview.md)
- revisa [Layers](../layers.md)
- revisa [RuntimeServices](../runtime-services.md)
- revisa [Governance](../governance.md)

## Navegación recomendada

- [🎪 Brochure](../brochure.md)
- [🖥️ Designer Guide](./designer.md)
- [🏗️ Architecture](../architecture/overview.md)
- [🛡️ Governance](../governance.md)
