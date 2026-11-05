# 🌿 EcoRuta Palín

> **Plataforma Integral de Gestión de Residuos, Economía Circular y Logística de Reciclaje Inteligente**  
> *Municipio de Palín, Escuintla, Guatemala*

---

## 📌 Visión General

**EcoRuta Palín** es una solución tecnológica multiplataforma (Android, iOS y Web) orientada a la sostenibilidad urbana, economía circular comunitaria y optimización de recolección de residuos sólidos. 

La plataforma articula y conecta en tiempo real a cinco actores clave:
1. **Vecinos/Clientes:** Clasifican residuos, fijan geolocalización de su vivienda, acumulan puntos ecológicos con su `codigo_vecino` único y canjean beneficios.
2. **Operarios de Campo:** Pesan y registran entregas en ruta con soporte offline-first y sincronización en la nube.
3. **Supervisores de Logística:** Crean cuadrillas, asignan personal y despachan rutas de camiones.
4. **Comercios Afiliados:** Premian la fidelidad ambiental validando canjes con defensas antifraude y escaneo híbrido (móvil y lector láser en Web).
5. **Administración Central:** Monitorea la operación mediante un Centro de Comando cartográfico (flota en vivo y mapa de calor de clientes), finanzas y control de personal.

---

## 📱 Módulos y Roles del Sistema

```
                       ┌─────────────────────────┐
                       │      EcoRuta Palín      │
                       │   (Control de Acceso)   │
                       └────────────┬────────────┘
                                    │
    ┌──────────────┬────────────────┼──────────────┬──────────────┐
    │              │                │              │              │
    ▼              ▼                ▼              ▼              ▼
┌────────┐   ┌───────────┐    ┌────────────┐   ┌─────────┐   ┌─────────┐
│ Cliente│   │ Operario  │    │ Supervisor │   │Afiliado │   │  Admin  │
│(Vecino)│   │(Ruta/Peso)│    │(Logística) │   │(Comercio│   │(Gerencia│
└────────┘   └───────────┘    └────────────┘   └─────────┘   └─────────┘
```

### 1. 👤 Cliente / Vecino (`ClientNavigator`)
- **Geolocalización de Vivienda:** Registro de coordenadas exactas (GPS y selección en mapa interactivo) guardadas en su perfil para optimización de rutas de recogida.
- **Billetera Ecológica (`ClientWalletScreen`):** Código de Vecino alfanumérico corto (ej. `P-A1B2C3`) y código QR para lectura rápida en campo sin exponer IDs internos.
- **Métricas de Impacto:** Visualización de árboles salvados, emisiones de CO₂ evitadas y volumen de reciclaje aportado.
- **Catálogo de Recompensas:** Exploración de cupones, promociones y descuentos en comercios aliados de Palín.

### 2. 🚛 Operario de Recolección (`OperatorNavigator`)
- **Configuración de Unidad:** Vinculación al camión y cuadrilla asignada del día.
- **Escáner y Registro de Pesaje:** Captura rápida del código de vecino y registro de pesaje segregado por material:
  - 🧴 Plásticos (PET, HDPE)
  - 📦 Papel y Cartón
  - 🍾 Vidrio
  - 🥫 Metales y Aluminio
  - 🍃 Residuos Orgánicos
- **Modo Offline-First:** Almacenamiento local automático en SQLite (`expo-sqlite`) para zonas con baja o nula cobertura celular, con sincronización automática en background (`syncManager`).

### 3. 👷 Supervisor de Campo y Logística (`SupervisorNavigator`)
- **Gestión de Cuadrillas:** Creación de cuadrillas operativas y asignación ágil de operarios activos disponibles (`cuadrilla_id IS NULL`).
- **Despacho de Rutas:** Asignación directa de cuadrillas completas a rutas de recolección (`rutas`).
- **Supervisión Territorial:** Mapa de seguimiento con marcadores de clientes suscritos para planificar rutas de recolección eficientes.

### 4. 🏪 Comercio Afiliado (`AffiliateNavigator`)
- **Escaneo Híbrido Multiplataforma:**
  - **Móvil (Android / iOS):** Cámara integrada con escaneo automático de códigos QR.
  - **Web (Punto de Venta / POS):** Input optimizado para pistolas de código de barras láser Bluetooth / USB con detección inmediata en evento `onSubmitEditing`.
- **Defensas Antifraude y Reglas de Negocio:**
  - **Cooldown de 30 minutos:** Bloqueo preventivo de canjes repetidos del mismo cliente en el mismo comercio dentro de una ventana de 30 minutos.
  - **Control de Stock (`limite_canjes`):** Decremento automático de existencias y desactivación al agotarse.
  - **Control de Caducidad:** Validación en tiempo de ejecución de la fecha límite (`fecha_fin`).
- **Propuesta de Ofertas:** Creación de promociones con definición de stock, costo en puntos y fecha de caducidad para revisión administrativa.
- **Liquidación CPA:** Control de cuentas por pagar a EcoRuta bajo esquema de comisión fija por cliente referido.

### 5. 📊 Administrador General (`AdminNavigator`)
- **Centro de Comando Cartográfico (`AdminFleetMapScreen`):**
  - **Capa 📍 Mapa de Calor (Clientes):** Visualización territorial de densidad de clientes para toma de decisiones y expansión.
  - **Capa 🚛 Flota Activa:** Monitoreo en tiempo real de cuadrillas de camiones con estampa de última actualización y ubicación.
- **Directorio de Personal y RBAC:** Consulta en vivo desde Supabase y registro seguro de colaboradores con roles base (`operario`, `piloto`, `supervisor`, `admin`, `afiliado`, `cliente`) o personalizados (ej. `ayudante`, `guardia`).
- **Gestión de Recompensas:** Aprobación, contrapropuesta y fiscalización de ofertas emitidas por comercios afiliados.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Framework Móvil / Web** | [React Native 0.88](https://reactnative.dev/) / [Expo SDK 58](https://expo.dev/) (React 19) |
| **Navegación** | [React Navigation 7](https://reactnavigation.org/) (Native Stack & Bottom Tabs) |
| **Backend & Base de Datos** | [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Storage, Auth) |
| **Almacenamiento Local / Offline** | [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), Async Storage, Secure Store |
| **Mapas & Geolocalización** | [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/), `react-native-maps` (Nativo) / Leaflet & OpenStreetMap (Web) |
| **Hardware & Periféricos** | [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/), Pistolas láser de código de barras |
| **Gestión de Estado** | [Zustand](https://github.com/pmndrs/zustand) |

---

## 📂 Estructura del Proyecto

```text
EcoRuta_Palín/
├── assets/                     # Iconos, imágenes y recursos estáticos
├── src/
│   ├── api/                    # Clientes y servicios API hacia Supabase
│   │   ├── admin.js            # Estadísticas, métricas y conciliaciones
│   │   ├── affiliate.js        # Canjes, antifraude, ofertas y comercios
│   │   ├── auth.js             # Autenticación y recuperación de credenciales
│   │   ├── client.js           # Perfil ciudadano, geolocalización y wallet
│   │   ├── collections.js      # Pesajes y registro de reciclaje
│   │   ├── financial.js        # Reportes financieros y balances
│   │   ├── logistics.js        # Cuadrillas, camiones y despacho de rutas
│   │   ├── reports.js          # Exportación y resúmenes operativos
│   │   └── roles.js            # Asignación y gestión de personal
│   ├── components/
│   │   └── common/
│   │       ├── EcoMap.js       # Selector de mapa según plataforma
│   │       ├── EcoMap.native.js# Mapa nativo con react-native-maps
│   │       └── EcoMap.web.js   # Mapa Web con Leaflet / OpenStreetMap
│   ├── constants/              # Colores, roles y catálogo de materiales
│   ├── navigation/             # Enrutamiento modular por rol (RootNavigator)
│   ├── screens/
│   │   ├── admin/              # Pantallas del panel administrativo y mapa de flota
│   │   ├── affiliate/          # Pantallas de comercios afiliados y POS
│   │   ├── auth/               # Inicio de sesión y autenticación
│   │   ├── client/             # Pantallas para vecinos y billetera
│   │   ├── operator/           # Pantallas de pesaje, cuadrilla y escáner
│   │   └── supervisor/         # Pantallas de supervisión y asignación de rutas
│   ├── services/
│   │   ├── sqlite/             # Base de datos local SQLite para soporte offline
│   │   ├── supabase.js         # Inicialización del cliente Supabase
│   │   └── syncManager.js      # Reconciliación y sincronización de datos
│   ├── store/                  # Stores globales (Zustand: useAuthStore)
│   └── utils/                  # Utilidades auxiliares y disparadores
├── app.json                    # Manifiesto y configuración de Expo SDK
├── package.json                # Dependencias del proyecto
└── README.md                   # Documentación principal
```

---

## 🚀 Instalación y Puesta en Marcha

### 1. Requisitos Previos
- [Node.js](https://nodejs.org/) (versión 18 o superior recomendada).
- [Expo Go](https://expo.dev/go) en tu dispositivo móvil (Android/iOS) o emulador local.

### 2. Clonar el Repositorio
```bash
git clone https://github.com/EmmanuelAlonzo/EcoRuta_Pal-n.git
cd EcoRuta_Pal-n
```

### 3. Instalar Dependencias
```bash
npm install
```

### 4. Configurar Variables de Entorno
Crea un archivo `.env` en la raíz del proyecto tomando como referencia `.env.example`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui
```

### 5. Iniciar la Aplicación

```bash
# Servidor de desarrollo con Metro Bundler
npm start

# Ejecutar directamente en Android
npm run android

# Ejecutar directamente en iOS (macOS requerido)
npm run ios

# Ejecutar en Navegador Web
npm run web
```

---

## 🔒 Mecanismos de Seguridad y Resiliencia

1. **Códigos de Vecino Desacoplados (`codigo_vecino`):** Los códigos QR y físicos contienen identificadores cortos y amigables (ej. `P-A1B2C3`), previniendo la exposición pública de identificadores UUID internos de base de datos.
2. **Defensa Antifraude con Cooldown:** Impide el abuso de canjes consecutivos verificando el historial en los últimos 30 minutos antes de debitar puntos.
3. **Persistencia Híbrida Offline-First:** Si se pierde la conectividad en sectores rurales de Palín, los pesajes quedan asegurados en SQLite local con firmas temporales y se replican al reconectar.
4. **Mapeo Agnóstico Cross-Platform:** El componente `EcoMap` conmuta fluidamente entre Google Maps / Apple Maps en móviles nativos y Leaflet en la web sin quebrar la experiencia de usuario.

---

## 👥 Equipo y Créditos

Proyecto desarrollado en el marco del curso de **Emprendimiento de Negocios Tecnológicos** (8vo Semestre).  
Enfocado en la modernización de servicios urbanos y preservación ambiental en el municipio de **Palín, Escuintla**.
