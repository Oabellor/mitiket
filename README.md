# AEtickets — APK Build

Gestión de tickets de empresa para Aerolaser Systems.

## Contenido

```
aetickets-apk/
├── www/
│   ├── index.html      ← App completa
│   ├── manifest.json   ← PWA manifest
│   ├── sw.js           ← Service worker
│   ├── icon-192.png    ← Icono app
│   └── icon-512.png    ← Icono splash
├── package.json
├── capacitor.config.json
└── .github/
    └── workflows/
        └── build.yml   ← GitHub Actions
```

## Instrucciones

1. Crea un repositorio en GitHub (ej: `aetickets`)
2. Sube **todos estos archivos** manteniendo la estructura de carpetas
   - `.github/workflows/build.yml` → créalo así en GitHub: New file → escribe `.github/workflows/build.yml`
3. GitHub Actions compila automáticamente el APK
4. Descarga el APK desde: **Actions → Build AEtickets APK → Artifacts → AEtickets-APK**

## Primera compilación

La primera compilación tarda ~8-10 minutos (descarga Gradle, Android SDK).
Las siguientes tardan ~3-4 minutos.
