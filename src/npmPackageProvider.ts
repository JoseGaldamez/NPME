import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class NpmPackageProvider implements vscode.TreeDataProvider<PackageItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PackageItem | undefined | null | void> = new vscode.EventEmitter<PackageItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PackageItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private workspaceRoot: string | undefined) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PackageItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: PackageItem): Thenable<PackageItem[]> {
        if (!element) {
            // Elementos raíz
            return Promise.resolve([
                new PackageItem('Buscar paquetes NPM', vscode.TreeItemCollapsibleState.None, {
                    command: 'npme.searchAndInstall',
                    title: 'Buscar',
                    arguments: []
                }),
                new PackageItem('Dependencias instaladas', vscode.TreeItemCollapsibleState.Collapsed, undefined, 'dependencies')
            ]);
        } else if (element.contextValue === 'dependencies') {
            // Mostrar secciones de dependencias
            return Promise.resolve(this.getDependencySections());
        } else if (element.contextValue === 'section-dependencies') {
            // Mostrar dependencias de producción
            return Promise.resolve(this.getProductionDependencies());
        } else if (element.contextValue === 'section-devDependencies') {
            // Mostrar dependencias de desarrollo
            return Promise.resolve(this.getDevDependencies());
        } else {
            return Promise.resolve([]);
        }
    }

    private getDependencySections(): PackageItem[] {
        if (!this.workspaceRoot) {
            return [new PackageItem('No hay workspace abierto', vscode.TreeItemCollapsibleState.None)];
        }

        const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
        
        if (!fs.existsSync(packageJsonPath)) {
            return [new PackageItem('No se encontró package.json', vscode.TreeItemCollapsibleState.None)];
        }

        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const dependencies = packageJson.dependencies || {};
            const devDependencies = packageJson.devDependencies || {};
            
            const items: PackageItem[] = [];

            // Agregar sección de dependencias de producción
            if (Object.keys(dependencies).length > 0) {
                items.push(new PackageItem('Dependencies', vscode.TreeItemCollapsibleState.Collapsed, undefined, 'section-dependencies'));
            }

            // Agregar sección de dependencias de desarrollo
            if (Object.keys(devDependencies).length > 0) {
                items.push(new PackageItem('DevDependencies', vscode.TreeItemCollapsibleState.Collapsed, undefined, 'section-devDependencies'));
            }

            if (items.length === 0) {
                return [new PackageItem('No hay dependencias instaladas', vscode.TreeItemCollapsibleState.None)];
            }

            return items;
        } catch (error) {
            return [new PackageItem('Error al leer package.json', vscode.TreeItemCollapsibleState.None)];
        }
    }

    private getProductionDependencies(): PackageItem[] {
        if (!this.workspaceRoot) {
            return [];
        }

        const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
        
        if (!fs.existsSync(packageJsonPath)) {
            return [];
        }

        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const dependencies = packageJson.dependencies || {};
            
            return Object.keys(dependencies).map(dep => 
                new PackageItem(
                    `${dep} (${dependencies[dep]})`,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'npme.showPackageDetails',
                        title: 'Ver detalles',
                        arguments: [dep, dependencies[dep], false]
                    },
                    'dependency'
                )
            );
        } catch (error) {
            return [];
        }
    }

    private getDevDependencies(): PackageItem[] {
        if (!this.workspaceRoot) {
            return [];
        }

        const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
        
        if (!fs.existsSync(packageJsonPath)) {
            return [];
        }

        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const devDependencies = packageJson.devDependencies || {};
            
            return Object.keys(devDependencies).map(dep => 
                new PackageItem(
                    `${dep} (${devDependencies[dep]})`,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'npme.showPackageDetails',
                        title: 'Ver detalles',
                        arguments: [dep, devDependencies[dep], true]
                    },
                    'devDependency'
                )
            );
        } catch (error) {
            return [];
        }
    }
}

class PackageItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command,
        public readonly contextValue?: string
    ) {
        super(label, collapsibleState);
        
        if (label === 'Buscar paquetes NPM') {
            this.iconPath = new vscode.ThemeIcon('search');
        } else if (label === 'Dependencias instaladas') {
            this.iconPath = new vscode.ThemeIcon('package');
        } else if (contextValue === 'dependency') {
            this.iconPath = new vscode.ThemeIcon('symbol-package');
        } else if (contextValue === 'devDependency') {
            this.iconPath = new vscode.ThemeIcon('tools');
        } else if (contextValue === 'section-dependencies' || contextValue === 'section-devDependencies') {
            this.iconPath = new vscode.ThemeIcon('folder');
        }

        this.contextValue = contextValue;
    }
}
