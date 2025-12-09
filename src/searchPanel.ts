import * as vscode from 'vscode';
import * as path from 'path';

export class SearchPanel {
    public static currentPanel: SearchPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _onPackageInstalled: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onPackageInstalled: vscode.Event<void> = this._onPackageInstalled.event;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;

        // Establecer el contenido HTML inicial
        this._panel.webview.html = this._getHtmlContent();

        // Escuchar cuando el panel se cierra
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Manejar mensajes del webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'search':
                        this._searchPackages(message.query);
                        return;
                    case 'getReadme':
                        this._getReadme(message.packageName, message.version);
                        return;
                    case 'install':
                        this._installPackage(message.packageName, message.isDev);
                        return;
                    case 'uninstall':
                        this._uninstallPackage(message.packageName);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static showPackageDetails(extensionUri: vscode.Uri, packageName: string, version: string, isDev: boolean) {
        // Crear un nuevo panel para detalles del paquete
        const panel = vscode.window.createWebviewPanel(
            'npmPackageDetails',
            `${packageName}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        // Agregar icono al panel
        panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'package-icon.svg');

        // Crear una instancia temporal para manejar este panel
        const detailsPanel = new SearchPanel(panel, extensionUri);
        
        // Cargar detalles del paquete
        detailsPanel._showInstalledPackageDetails(packageName, version, isDev);
        
        return detailsPanel;
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        // Si ya existe un panel, mostrarlo
        if (SearchPanel.currentPanel) {
            SearchPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
            return;
        }

        // Crear un nuevo panel
        const panel = vscode.window.createWebviewPanel(
            'npmSearch',
            'Buscar Paquetes NPM',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        // Agregar icono al panel
        panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'package-icon.svg');

        SearchPanel.currentPanel = new SearchPanel(panel, extensionUri);
    }

    private async _searchPackages(query: string) {
        if (!query || query.trim() === '') {
            vscode.window.showWarningMessage('Por favor ingresa un término de búsqueda');
            return;
        }

        try {
            // Mostrar loading
            this._panel.webview.postMessage({ command: 'loading', isLoading: true });

            // Realizar búsqueda en npm registry
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=20`);
            const data: any = await response.json();

            // Obtener paquetes instalados
            const installedPackages = await this._getInstalledPackages();

            this._panel.webview.postMessage({
                command: 'results',
                packages: data.objects.map((obj: any) => ({
                    name: obj.package.name,
                    version: obj.package.version,
                    description: obj.package.description || 'Sin descripción',
                    author: obj.package.author?.name || obj.package.publisher?.username || 'Desconocido',
                    date: obj.package.date,
                    isInstalled: installedPackages.has(obj.package.name)
                }))
            });

            this._panel.webview.postMessage({ command: 'loading', isLoading: false });
        } catch (error) {
            this._panel.webview.postMessage({ command: 'loading', isLoading: false });
            vscode.window.showErrorMessage(`Error al buscar paquetes: ${error}`);
        }
    }

    private async _getReadme(packageName: string, version: string) {
        try {
            const fetch = (await import('node-fetch')).default;
            
            // Obtener información del paquete desde npm registry
            const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
            const data: any = await response.json();

            // Obtener el README (puede estar en formato markdown)
            let readme = data.readme || 'No hay README disponible para este paquete.';
            
            // Convertir markdown básico a HTML
            readme = this._markdownToHtml(readme);

            // Enviar README al webview
            this._panel.webview.postMessage({
                command: 'readme',
                packageName: packageName,
                readme: readme
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error al obtener README: ${error}`);
            this._panel.webview.postMessage({
                command: 'readme',
                packageName: packageName,
                readme: '<p>Error al cargar el README</p>'
            });
        }
    }

    private async _getInstalledPackages(): Promise<Set<string>> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            return new Set();
        }

        try {
            const fs = await import('fs');
            const packageJsonPath = path.join(workspaceFolder.uri.fsPath, 'package.json');
            
            if (!fs.existsSync(packageJsonPath)) {
                return new Set();
            }

            const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(packageJsonContent);
            
            const installedPackages = new Set<string>();
            
            // Agregar dependencies
            if (packageJson.dependencies) {
                Object.keys(packageJson.dependencies).forEach(pkg => installedPackages.add(pkg));
            }
            
            // Agregar devDependencies
            if (packageJson.devDependencies) {
                Object.keys(packageJson.devDependencies).forEach(pkg => installedPackages.add(pkg));
            }
            
            return installedPackages;
        } catch (error) {
            console.error('Error al leer package.json:', error);
            return new Set();
        }
    }

    private async _installPackage(packageName: string, isDev: boolean = false) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No hay un workspace abierto');
            return;
        }

        // Preguntar si es dev dependency
        const choice = await vscode.window.showQuickPick(
            [
                { label: 'Dependencia de producción', value: false },
                { label: 'Dependencia de desarrollo', value: true }
            ],
            { placeHolder: `¿Cómo quieres instalar ${packageName}?` }
        );

        if (!choice) {
            return; // Usuario canceló
        }

        isDev = choice.value;

        // Mostrar mensaje de inicio
        vscode.window.showInformationMessage(`Instalando ${packageName}...`);

        const flag = isDev ? '--save-dev' : '--save';
        const command = `npm install ${packageName} ${flag}`;
        
        const terminal = vscode.window.createTerminal({
            name: `NPM: ${packageName}`,
            cwd: workspaceFolder.uri.fsPath
        });
        
        terminal.show();
        terminal.sendText(command);

        // Monitorear el archivo package.json para saber cuándo termina
        const fs = await import('fs');
        const path = await import('path');
        const packageJsonPath = path.join(workspaceFolder.uri.fsPath, 'package.json');
        
        // Obtener el timestamp inicial del archivo
        let initialMtime = 0;
        let initialHasPackage = false;
        try {
            const stats = fs.statSync(packageJsonPath);
            initialMtime = stats.mtimeMs;
            const content = fs.readFileSync(packageJsonPath, 'utf-8');
            initialHasPackage = content.includes(`"${packageName}"`);
        } catch (e) {
            console.log('No se pudo leer package.json inicial');
        }

        // Monitorear cambios en package.json
        let checkCount = 0;
        const maxChecks = 180; // 3 minutos máximo
        
        const checkInterval = setInterval(() => {
            checkCount++;
            
            try {
                const stats = fs.statSync(packageJsonPath);
                
                // Si el archivo fue modificado después del inicio
                if (stats.mtimeMs > initialMtime) {
                    const currentContent = fs.readFileSync(packageJsonPath, 'utf-8');
                    
                    // Verificar que el paquete ahora está en package.json
                    if (currentContent.includes(`"${packageName}"`)) {
                        clearInterval(checkInterval);
                        vscode.window.showInformationMessage(`${packageName} instalado correctamente`);
                        this._onPackageInstalled.fire();
                        
                        // Notificar al webview
                        this._panel.webview.postMessage({
                            command: 'installComplete',
                            packageName: packageName
                        });
                    }
                }
                
                if (checkCount >= maxChecks) {
                    // Timeout después de 3 minutos
                    clearInterval(checkInterval);
                    
                    // Verificar una última vez si se instaló
                    const finalContent = fs.readFileSync(packageJsonPath, 'utf-8');
                    if (finalContent.includes(`"${packageName}"`) && !initialHasPackage) {
                        vscode.window.showInformationMessage(`${packageName} instalado correctamente`);
                        this._onPackageInstalled.fire();
                        this._panel.webview.postMessage({
                            command: 'installComplete',
                            packageName: packageName
                        });
                    } else {
                        vscode.window.showWarningMessage(`No se pudo confirmar la instalación de ${packageName}. Verifica la terminal.`);
                    }
                }
            } catch (e) {
                // Ignorar errores de lectura
            }
        }, 500); // Revisar cada medio segundo para ser más rápido
    }

    private async _uninstallPackage(packageName: string) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No hay un workspace abierto');
            return;
        }

        // Confirmar desinstalación
        const confirm = await vscode.window.showWarningMessage(
            `¿Estás seguro de que quieres desinstalar ${packageName}?`,
            { modal: true },
            'Sí, desinstalar',
            'Cancelar'
        );

        if (confirm !== 'Sí, desinstalar') {
            return;
        }

        // Mostrar mensaje de inicio
        vscode.window.showInformationMessage(`Desinstalando ${packageName}...`);

        const command = `npm uninstall ${packageName}`;
        
        const terminal = vscode.window.createTerminal({
            name: `NPM: Desinstalando ${packageName}`,
            cwd: workspaceFolder.uri.fsPath
        });
        
        terminal.show();
        terminal.sendText(command);

        // Monitorear package.json para detectar cuando se desinstale
        const fs = await import('fs');
        const path = await import('path');
        const packageJsonPath = path.join(workspaceFolder.uri.fsPath, 'package.json');
        
        let initialMtime = 0;
        try {
            const stats = fs.statSync(packageJsonPath);
            initialMtime = stats.mtimeMs;
        } catch (e) {
            console.log('No se pudo leer package.json inicial');
        }

        let checkCount = 0;
        const maxChecks = 180;
        
        const checkInterval = setInterval(() => {
            checkCount++;
            
            try {
                const stats = fs.statSync(packageJsonPath);
                
                if (stats.mtimeMs > initialMtime) {
                    const currentContent = fs.readFileSync(packageJsonPath, 'utf-8');
                    
                    // Verificar que el paquete ya no está en package.json
                    if (!currentContent.includes(`"${packageName}"`)) {
                        clearInterval(checkInterval);
                        vscode.window.showInformationMessage(`${packageName} desinstalado correctamente`);
                        this._onPackageInstalled.fire(); // Refrescar vista
                        
                        // Cerrar el panel
                        this._panel.dispose();
                    }
                }
                
                if (checkCount >= maxChecks) {
                    clearInterval(checkInterval);
                    const finalContent = fs.readFileSync(packageJsonPath, 'utf-8');
                    if (!finalContent.includes(`"${packageName}"`)) {
                        vscode.window.showInformationMessage(`${packageName} desinstalado correctamente`);
                        this._onPackageInstalled.fire();
                        this._panel.dispose();
                    } else {
                        vscode.window.showWarningMessage(`No se pudo confirmar la desinstalación de ${packageName}. Verifica la terminal.`);
                    }
                }
            } catch (e) {
                // Ignorar errores de lectura
            }
        }, 500);
    }

    private async _showInstalledPackageDetails(packageName: string, version: string, isDev: boolean) {
        // Mostrar loader mientras se carga la información
        this._panel.webview.html = this._getLoadingHtml(packageName);

        try {
            const fetch = (await import('node-fetch')).default;
            
            // Obtener información del paquete
            const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
            const data: any = await response.json();

            // Obtener README
            let readme = data.readme || 'No hay README disponible para este paquete.';
            readme = this._markdownToHtml(readme);

            // Crear HTML del panel de detalles
            this._panel.webview.html = this._getPackageDetailsHtml(packageName, version, isDev, data, readme);

        } catch (error) {
            vscode.window.showErrorMessage(`Error al obtener información del paquete: ${error}`);
            this._panel.webview.html = this._getPackageDetailsHtml(packageName, version, isDev, null, '<p>Error al cargar información</p>');
        }
    }

    private _markdownToHtml(markdown: string): string {
        // Conversión mejorada de markdown a HTML
        let html = markdown;
        
        // Code blocks (antes de escapar HTML)
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || 'text';
            const highlightedCode = this._highlightCode(code.trim(), language);
            const languageLabel = language !== 'text' ? `<span class="code-language">${language}</span>` : '';
            return `<div class="code-block-wrapper">${languageLabel}<pre><code>${highlightedCode}</code></pre></div>`;
        });
        
        // Inline code (antes de escapar HTML)
        const codeBlocks: string[] = [];
        html = html.replace(/`([^`]+)`/g, (match, code) => {
            const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
            codeBlocks.push(`<code>${this._escapeHtml(code)}</code>`);
            return placeholder;
        });
        
        // Blockquotes
        html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
        
        // Headers
        html = html.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
        html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
        
        // Images (antes de links para evitar conflictos)
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto;" />');
        
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // Bold (antes de italic)
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        
        // Italic
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/_(.+?)_/g, '<em>$1</em>');
        
        // Unordered lists
        html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
        
        // Ordered lists
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        
        // Horizontal rules
        html = html.replace(/^---$/gm, '<hr>');
        html = html.replace(/^\*\*\*$/gm, '<hr>');
        
        // Párrafos (separados por doble salto de línea)
        html = html.replace(/\n\n+/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        
        // Restaurar bloques de código inline
        codeBlocks.forEach((code, index) => {
            html = html.replace(`__CODE_BLOCK_${index}__`, code);
        });
        
        return `<div>${html}</div>`;
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private _highlightCode(code: string, language: string): string {
        let highlighted = code;
        
        // Aplicar highlighting básico según el lenguaje (ANTES de escapar HTML)
        if (['javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx'].includes(language.toLowerCase())) {
            highlighted = this._highlightJavaScript(highlighted);
        } else if (['python', 'py'].includes(language.toLowerCase())) {
            highlighted = this._highlightPython(highlighted);
        } else if (['json'].includes(language.toLowerCase())) {
            highlighted = this._highlightJSON(highlighted);
        } else if (['bash', 'sh', 'shell'].includes(language.toLowerCase())) {
            highlighted = this._highlightBash(highlighted);
        } else if (['css', 'scss', 'sass'].includes(language.toLowerCase())) {
            highlighted = this._highlightCSS(highlighted);
        } else if (['html', 'xml'].includes(language.toLowerCase())) {
            highlighted = this._highlightHTML(highlighted);
        } else {
            // Si no hay highlighting específico, solo escapar HTML
            highlighted = this._escapeHtml(highlighted);
        }
        
        return highlighted;
    }

    private _highlightJavaScript(code: string): string {
        // Proteger strings temporalmente
        const strings: string[] = [];
        code = code.replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, (match) => {
            const index = strings.length;
            strings.push(match);
            return `__STRING_${index}__`;
        });
        
        // Proteger comentarios temporalmente
        const comments: string[] = [];
        code = code.replace(/\/\/.*$/gm, (match) => {
            const index = comments.length;
            comments.push(match);
            return `__COMMENT_${index}__`;
        });
        code = code.replace(/\/\*[\s\S]*?\*\//g, (match) => {
            const index = comments.length;
            comments.push(match);
            return `__COMMENT_${index}__`;
        });
        
        // Escapar HTML del código restante
        code = this._escapeHtml(code);
        
        // Keywords
        const keywords = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'class', 'extends', 'import', 'export', 'default', 'from', 'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'super', 'static'];
        keywords.forEach(keyword => {
            code = code.replace(new RegExp(`\\b(${keyword})\\b`, 'g'), '<span style="color: #569cd6;">$1</span>');
        });
        
        // Numbers
        code = code.replace(/\b(\d+\.?\d*)\b/g, '<span style="color: #b5cea8;">$1</span>');
        
        // Functions
        code = code.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span style="color: #dcdcaa;">$1</span>');
        
        // Restaurar comentarios
        comments.forEach((comment, index) => {
            code = code.replace(`__COMMENT_${index}__`, `<span style="color: #6a9955;">${this._escapeHtml(comment)}</span>`);
        });
        
        // Restaurar strings
        strings.forEach((str, index) => {
            code = code.replace(`__STRING_${index}__`, `<span style="color: #ce9178;">${this._escapeHtml(str)}</span>`);
        });
        
        return code;
    }

    private _highlightPython(code: string): string {
        // Proteger strings temporalmente
        const strings: string[] = [];
        code = code.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
            const index = strings.length;
            strings.push(match);
            return `__STRING_${index}__`;
        });
        
        // Proteger comentarios temporalmente
        const comments: string[] = [];
        code = code.replace(/#.*$/gm, (match) => {
            const index = comments.length;
            comments.push(match);
            return `__COMMENT_${index}__`;
        });
        
        // Escapar HTML del código restante
        code = this._escapeHtml(code);
        
        // Keywords
        const keywords = ['def', 'class', 'import', 'from', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'try', 'except', 'finally', 'with', 'as', 'lambda', 'pass', 'break', 'continue', 'yield', 'async', 'await'];
        keywords.forEach(keyword => {
            code = code.replace(new RegExp(`\\b(${keyword})\\b`, 'g'), '<span style="color: #569cd6;">$1</span>');
        });
        
        // Numbers
        code = code.replace(/\b(\d+\.?\d*)\b/g, '<span style="color: #b5cea8;">$1</span>');
        
        // Restaurar comentarios
        comments.forEach((comment, index) => {
            code = code.replace(`__COMMENT_${index}__`, `<span style="color: #6a9955;">${this._escapeHtml(comment)}</span>`);
        });
        
        // Restaurar strings
        strings.forEach((str, index) => {
            code = code.replace(`__STRING_${index}__`, `<span style="color: #ce9178;">${this._escapeHtml(str)}</span>`);
        });
        
        return code;
    }

    private _highlightJSON(code: string): string {
        // Escapar HTML primero
        code = this._escapeHtml(code);
        
        // Keys (después de escapar, las comillas son &quot;)
        code = code.replace(/(&quot;[^&]+?&quot;)(\s*:)/g, '<span style="color: #9cdcfe;">$1</span>$2');
        
        // String values
        code = code.replace(/(:[ \s]*)(&quot;[^&]*?&quot;)/g, '$1<span style="color: #ce9178;">$2</span>');
        
        // Numbers
        code = code.replace(/:\s*(\d+\.?\d*)/g, ': <span style="color: #b5cea8;">$1</span>');
        
        // Booleans and null
        code = code.replace(/\b(true|false|null)\b/g, '<span style="color: #569cd6;">$1</span>');
        
        return code;
    }

    private _highlightBash(code: string): string {
        // Proteger strings temporalmente
        const strings: string[] = [];
        code = code.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
            const index = strings.length;
            strings.push(match);
            return `__STRING_${index}__`;
        });
        
        // Escapar HTML del código restante
        code = this._escapeHtml(code);
        
        // Commands
        code = code.replace(/^\$\s*/gm, '<span style="color: #569cd6;">$ </span>');
        code = code.replace(/^#\s*/gm, '<span style="color: #569cd6;"># </span>');
        
        // Comments
        code = code.replace(/(#.*$)/gm, '<span style="color: #6a9955;">$1</span>');
        
        // Keywords
        const keywords = ['sudo', 'npm', 'cd', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'echo', 'cat', 'grep', 'git'];
        keywords.forEach(keyword => {
            code = code.replace(new RegExp(`\\b(${keyword})\\b`, 'g'), '<span style="color: #569cd6;">$1</span>');
        });
        
        // Restaurar strings
        strings.forEach((str, index) => {
            code = code.replace(`__STRING_${index}__`, `<span style="color: #ce9178;">${this._escapeHtml(str)}</span>`);
        });
        
        return code;
    }

    private _highlightCSS(code: string): string {
        // Escapar HTML primero
        code = this._escapeHtml(code);
        
        // Selectors
        code = code.replace(/^([.#]?[\w-]+)\s*\{/gm, '<span style="color: #d7ba7d;">$1</span> {');
        
        // Properties
        code = code.replace(/\b([\w-]+)(?=\s*:)/g, '<span style="color: #9cdcfe;">$1</span>');
        
        // Values
        code = code.replace(/:\s*([^;{]+)/g, ': <span style="color: #ce9178;">$1</span>');
        
        return code;
    }

    private _highlightHTML(code: string): string {
        // Escapar HTML primero
        code = this._escapeHtml(code);
        
        // Tags
        code = code.replace(/(&lt;\/?)([ \w-]+)/g, '$1<span style="color: #569cd6;">$2</span>');
        
        // Attributes
        code = code.replace(/\s([\w-]+)=/g, ' <span style="color: #9cdcfe;">$1</span>=');
        
        // Attribute values
        code = code.replace(/=(&quot;[^&]*?&quot;)/g, '=<span style="color: #ce9178;">$1</span>');
        
        return code;
    }

    private _getLoadingHtml(packageName: string): string {
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <title>Cargando...</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        .loader-container {
            text-align: center;
        }
        .spinner {
            border: 4px solid var(--vscode-panel-border);
            border-top: 4px solid var(--vscode-progressBar-background);
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        h2 {
            margin: 10px 0;
            color: var(--vscode-foreground);
        }
        p {
            color: var(--vscode-descriptionForeground);
            margin: 5px 0;
        }
    </style>
</head>
<body>
    <div class="loader-container">
        <div class="spinner"></div>
        <h2>Cargando información...</h2>
        <p>${packageName}</p>
    </div>
</body>
</html>`;
    }

    private _getPackageDetailsHtml(packageName: string, version: string, isDev: boolean, packageData: any, readme: string): string {
        const description = packageData?.description || 'Sin descripción';
        const author = packageData?.author?.name || packageData?.maintainers?.[0]?.name || 'Desconocido';
        const homepage = packageData?.homepage || `https://www.npmjs.com/package/${packageName}`;
        const repository = packageData?.repository?.url || '';
        const license = packageData?.license || 'N/A';
        const keywords = packageData?.keywords?.join(', ') || 'N/A';

        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
    <title>${packageName}</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 20px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .header {
            padding-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 20px;
        }
        h1 {
            margin: 0 0 10px 0;
            color: var(--vscode-foreground);
        }
        .version-badge {
            display: inline-block;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 12px;
            margin-right: 8px;
        }
        .dev-badge {
            display: inline-block;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 12px;
        }
        .info-section {
            margin: 20px 0;
        }
        .info-row {
            display: flex;
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .info-label {
            font-weight: bold;
            width: 150px;
            color: var(--vscode-foreground);
        }
        .info-value {
            flex: 1;
            color: var(--vscode-descriptionForeground);
        }
        .info-value a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        .info-value a:hover {
            text-decoration: underline;
        }
        .actions {
            margin: 20px 0;
            padding: 20px 0;
            border-top: 1px solid var(--vscode-panel-border);
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
            font-family: var(--vscode-font-family);
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .uninstall-btn {
            background: var(--vscode-errorForeground);
            color: white;
        }
        .uninstall-btn:hover {
            opacity: 0.9;
            background: var(--vscode-errorForeground) !important;
        }
        .readme-section {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid var(--vscode-panel-border);
        }
        .readme-content {
            margin-top: 15px;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${packageName}</h1>
        <div>
            <span class="version-badge">${version}</span>
            ${isDev ? '<span class="dev-badge">Dev Dependency</span>' : '<span class="version-badge">Dependency</span>'}
        </div>
    </div>

    <div class="info-section">
        <div class="info-row">
            <div class="info-label">Descripción:</div>
            <div class="info-value">${description}</div>
        </div>
        <div class="info-row">
            <div class="info-label">Autor:</div>
            <div class="info-value">${author}</div>
        </div>
        <div class="info-row">
            <div class="info-label">Licencia:</div>
            <div class="info-value">${license}</div>
        </div>
        <div class="info-row">
            <div class="info-label">Keywords:</div>
            <div class="info-value">${keywords}</div>
        </div>
        ${homepage ? `<div class="info-row">
            <div class="info-label">Homepage:</div>
            <div class="info-value"><a href="${homepage}" target="_blank">${homepage}</a></div>
        </div>` : ''}
        ${repository ? `<div class="info-row">
            <div class="info-label">Repositorio:</div>
            <div class="info-value"><a href="${repository}" target="_blank">${repository}</a></div>
        </div>` : ''}
    </div>

    <div class="actions">
        <button class="uninstall-btn" onclick="uninstall()">🗑️ Desinstalar paquete</button>
    </div>

    <div class="readme-section">
        <h2>README</h2>
        <div class="readme-content">
            ${readme}
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function uninstall() {
            vscode.postMessage({
                command: 'uninstall',
                packageName: '${packageName}'
            });
        }
    </script>
</body>
</html>`;
    }

    private _getHtmlContent(): string {
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
    <title>Buscar Paquetes NPM</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            overflow: hidden;
        }
        .container {
            display: flex;
            height: 100vh;
            width: 100%;
        }
        .left-panel {
            width: 50%;
            padding: 20px;
            overflow-y: auto;
            border-right: 1px solid var(--vscode-panel-border);
        }
        .right-panel {
            width: 50%;
            padding: 20px;
            overflow-y: auto;
            display: none;
        }
        .right-panel.visible {
            display: block;
        }
        .search-container {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        #searchInput {
            flex: 1;
            padding: 8px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-size: 14px;
        }
        #searchInput:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        #searchButton {
            padding: 8px 20px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 14px;
        }
        #searchButton:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        #searchButton:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .results-container {
            margin-top: 20px;
        }
        .package-item {
            padding: 15px;
            margin-bottom: 10px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .package-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .package-item.selected {
            background-color: var(--vscode-list-activeSelectionBackground);
            border-color: var(--vscode-focusBorder);
        }
        .package-name {
            font-size: 16px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 5px;
        }
        .package-version {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-left: 10px;
        }
        .package-description {
            font-size: 13px;
            color: var(--vscode-foreground);
            margin-top: 5px;
        }
        .package-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 8px;
        }
        .loading {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
        }
        .no-results {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
        .install-button {
            float: right;
            padding: 4px 12px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
        }
        .install-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .install-button.installed,
        .install-button:disabled {
            background-color: var(--vscode-input-background);
            color: var(--vscode-descriptionForeground);
            cursor: not-allowed;
            opacity: 0.6;
        }
        .install-button.installed:hover,
        .install-button:disabled:hover {
            background-color: var(--vscode-input-background);
        }
        .readme-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid var(--vscode-panel-border);
        }
        .readme-title {
            font-size: 24px;
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
        }
        .readme-content {
            line-height: 1.8;
            font-size: 14px;
        }
        .readme-content h1 {
            font-size: 28px;
            font-weight: 600;
            margin-top: 32px;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
            color: var(--vscode-foreground);
        }
        .readme-content h2 {
            font-size: 22px;
            font-weight: 600;
            margin-top: 28px;
            margin-bottom: 14px;
            color: var(--vscode-foreground);
        }
        .readme-content h3 {
            font-size: 18px;
            font-weight: 600;
            margin-top: 24px;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }
        .readme-content p {
            margin: 12px 0;
            color: var(--vscode-foreground);
        }
        .readme-content pre {
            background-color: var(--vscode-editor-background);
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 20px 0;
            border: 1px solid var(--vscode-panel-border);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            position: relative;
        }
        .readme-content pre code {
            background-color: transparent;
            padding: 0;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.6;
            color: var(--vscode-editor-foreground);
            display: block;
            white-space: pre;
            word-wrap: normal;
        }
        .readme-content code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 4px 10px;
            border-radius: 4px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            color: var(--vscode-textPreformat-foreground);
            border: 1px solid var(--vscode-panel-border);
        }
        .code-block-wrapper {
            position: relative;
            margin: 20px 0;
        }
        .code-language {
            position: absolute;
            top: 8px;
            right: 12px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .readme-content a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        .readme-content a:hover {
            text-decoration: underline;
            color: var(--vscode-textLink-activeForeground);
        }
        .readme-content strong {
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        .readme-content em {
            font-style: italic;
            color: var(--vscode-descriptionForeground);
        }
        .readme-content ul, .readme-content ol {
            margin: 12px 0;
            padding-left: 24px;
        }
        .readme-content li {
            margin: 6px 0;
        }
        .readme-content blockquote {
            margin: 16px 0;
            padding: 12px 16px;
            border-left: 4px solid var(--vscode-textLink-foreground);
            background-color: var(--vscode-textBlockQuote-background);
            color: var(--vscode-foreground);
        }
        .close-readme {
            padding: 6px 16px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background-color 0.2s;
        }
        .close-readme:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="left-panel">
            <h2>Buscar Paquetes NPM</h2>
            <div class="search-container">
                <input type="text" id="searchInput" placeholder="Buscar paquetes (ej: express, react, lodash...)" />
                <button id="searchButton">Buscar</button>
            </div>
            
            <div id="results" class="results-container"></div>
        </div>
        
        <div class="right-panel" id="readmePanel">
            <div class="readme-header">
                <div class="readme-title" id="readmeTitle"></div>
                <button class="close-readme" onclick="closeReadme()">Cerrar</button>
            </div>
            <div id="readmeContent" class="readme-content"></div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const searchInput = document.getElementById('searchInput');
        const searchButton = document.getElementById('searchButton');
        const resultsDiv = document.getElementById('results');
        let currentPackages = [];

        searchButton.addEventListener('click', performSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        function performSearch() {
            const query = searchInput.value.trim();
            if (query) {
                vscode.postMessage({
                    command: 'search',
                    query: query
                });
            }
        }

        function installPackage(packageName, version, event) {
            event.stopPropagation();
            vscode.postMessage({
                command: 'install',
                packageName: packageName,
                version: version
            });
        }

        function showReadme(packageName, version) {
            vscode.postMessage({
                command: 'getReadme',
                packageName: packageName,
                version: version
            });
        }

        function closeReadme() {
            document.getElementById('readmePanel').classList.remove('visible');
            // Remover selección de todos los items
            document.querySelectorAll('.package-item').forEach(item => {
                item.classList.remove('selected');
            });
        }

        // Escuchar mensajes desde la extensión
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'loading':
                    if (message.isLoading) {
                        resultsDiv.innerHTML = '<div class="loading">🔍 Buscando paquetes...</div>';
                        searchButton.disabled = true;
                    } else {
                        searchButton.disabled = false;
                    }
                    break;
                    
                case 'results':
                    currentPackages = message.packages;
                    displayResults(currentPackages);
                    break;

                case 'readme':
                    displayReadme(message.packageName, message.readme);
                    break;

                case 'installComplete':
                    // Actualizar el estado del paquete en los resultados actuales
                    const installedPkg = currentPackages.find(pkg => pkg.name === message.packageName);
                    if (installedPkg) {
                        installedPkg.isInstalled = true;
                        displayResults(currentPackages);
                    }
                    
                    // Mostrar notificación de éxito
                    const notification = document.createElement('div');
                    notification.style.cssText = \`
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background-color: var(--vscode-notifications-background);
                        color: var(--vscode-notifications-foreground);
                        border: 1px solid var(--vscode-notifications-border);
                        padding: 12px 20px;
                        border-radius: 4px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                        z-index: 1000;
                    \`;
                    notification.textContent = \`✓ \${message.packageName} instalado correctamente\`;
                    document.body.appendChild(notification);
                    
                    setTimeout(() => {
                        notification.remove();
                    }, 3000);
                    break;
            }
        });

        function displayResults(packages) {
            if (!packages || packages.length === 0) {
                resultsDiv.innerHTML = '<div class="no-results">No se encontraron paquetes</div>';
                return;
            }

            resultsDiv.innerHTML = packages.map(pkg => \`
                <div class="package-item" onclick="selectPackage(this, '\${pkg.name}', '\${pkg.version}')">
                    <div>
                        <span class="package-name">\${pkg.name}</span>
                        <span class="package-version">v\${pkg.version}</span>
                        <button class="install-button \${pkg.isInstalled ? 'installed' : ''}" 
                                \${pkg.isInstalled ? 'disabled' : ''}
                                onclick="installPackage('\${pkg.name}', '\${pkg.version}', event)">
                            \${pkg.isInstalled ? '✓ Instalado' : 'Instalar'}
                        </button>
                    </div>
                    <div class="package-description">\${pkg.description}</div>
                    <div class="package-meta">
                        Autor: \${pkg.author} | Última actualización: \${new Date(pkg.date).toLocaleDateString()}
                    </div>
                </div>
            \`).join('');
        }

        function selectPackage(element, packageName, version) {
            // Remover selección previa
            document.querySelectorAll('.package-item').forEach(item => {
                item.classList.remove('selected');
            });
            // Marcar el item actual como seleccionado
            element.classList.add('selected');
            // Mostrar README
            showReadme(packageName, version);
        }

        function displayReadme(packageName, readme) {
            const readmePanel = document.getElementById('readmePanel');
            const readmeTitle = document.getElementById('readmeTitle');
            const readmeContent = document.getElementById('readmeContent');

            readmeTitle.textContent = packageName;
            readmeContent.innerHTML = readme;
            readmePanel.classList.add('visible');
        }
    </script>
</body>
</html>`;
    }

    public dispose() {
        SearchPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
