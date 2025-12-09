# NPME - NPM Package Manager Extension

![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)
![VS Code](https://img.shields.io/badge/VS%20Code-1.106.1+-blue.svg)

**NPME** es una extensión de Visual Studio Code que te permite administrar las dependencias de npm directamente desde el editor, sin necesidad de usar la terminal manualmente.

## 📦 Características

### Búsqueda de Paquetes NPM
- **Búsqueda en tiempo real** desde el registro oficial de npm
- **Vista previa de README** con formato completo
- **Información detallada** de cada paquete (autor, versión, descripción)
- **Instalación directa** como dependencia de producción o desarrollo

### Gestión de Dependencias Instaladas
- **Vista de árbol organizada** en el panel lateral
- Separación entre **Dependencies** y **DevDependencies**
- **Vista de detalles** al hacer clic en cualquier paquete instalado
- **Información completa** del paquete (descripción, autor, licencia, keywords, enlaces)
- **Botón de desinstalación** con confirmación

### Instalación Inteligente
- Ejecución en **terminal integrada** con salida en tiempo real
- **Detección automática** de finalización del proceso
- **Notificaciones** cuando la instalación/desinstalación termina
- **Actualización automática** de la vista después de cambios

## 🚀 Uso

### Buscar e Instalar Paquetes

1. Abre el panel lateral de **NPME** (icono de paquete 📦)
2. Haz clic en **"Buscar paquetes NPM"**
3. Escribe el nombre del paquete que buscas
4. Explora los resultados y haz clic en cualquier paquete para ver su README
5. Presiona el botón **"Instalar"** y selecciona el tipo de dependencia

### Ver Detalles de Paquetes Instalados

1. En el panel lateral de **NPME**, expande **"Dependencias instaladas"**
2. Navega por **Dependencies** o **DevDependencies**
3. Haz clic en cualquier paquete para ver:
   - Información detallada
   - README completo
   - Enlaces a homepage y repositorio
   - Botón para desinstalar

### Desinstalar Paquetes

1. Haz clic en el paquete que deseas desinstalar
2. En el panel de detalles, presiona **"🗑️ Desinstalar paquete"**
3. Confirma la acción
4. El proceso se ejecuta en la terminal y la vista se actualiza automáticamente

## ⚙️ Comandos

- **NPME: Search and Install** - Abre el panel de búsqueda de paquetes
- **Refresh** - Actualiza manualmente la lista de dependencias

## 📋 Requisitos

- Visual Studio Code v1.106.1 o superior
- Node.js y npm instalados en tu sistema
- Proyecto con `package.json` (para gestionar dependencias instaladas)

## 🎯 Características Técnicas

- ✅ Monitoreo automático de cambios en `package.json`
- ✅ Renderizado de Markdown para README
- ✅ Sintaxis highlighting para bloques de código
- ✅ Indicadores visuales de carga
- ✅ Manejo de errores robusto
- ✅ Iconos personalizados para cada tipo de dependencia

## 🐛 Problemas Conocidos

Ninguno reportado por el momento.

## 📝 Notas de Versión

### 0.0.1 (Versión Inicial)

#### ✨ Características
- Búsqueda de paquetes npm con resultados en tiempo real
- Instalación de paquetes como dependencias de producción o desarrollo
- Vista de dependencias instaladas organizadas por tipo
- Panel de detalles completo para cada paquete
- Desinstalación de paquetes con confirmación
- Detección automática de finalización de procesos npm
- Renderizado completo de README con formato Markdown
- Iconos personalizados en pestañas de paneles

#### 🎨 Interfaz
- Panel lateral dedicado en la Activity Bar
- Vista de árbol con iconos distintivos
- Loader animado mientras se cargan datos
- Diseño adaptado al tema de VS Code

## 🤝 Contribuir

¿Encontraste un bug o tienes una idea para mejorar NPME? ¡Abre un issue o envía un pull request!

## 📄 Licencia

Este proyecto está bajo la licencia MIT.

---

**¡Disfruta gestionando tus dependencias npm sin salir de VS Code!** 🚀

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
