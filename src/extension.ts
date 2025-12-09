// En src/extension.ts
import * as vscode from 'vscode';
import { NpmPackageProvider } from './npmPackageProvider';
import { SearchPanel } from './searchPanel';

export function activate(context: vscode.ExtensionContext) {

    console.log('¡La extensión NPME está activa!');

    // Obtener la ruta del workspace
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    // Crear el proveedor de vista para el panel lateral
    const npmPackageProvider = new NpmPackageProvider(workspaceRoot);
    
    // Registrar el TreeView en el panel lateral
    vscode.window.registerTreeDataProvider('npme-packages', npmPackageProvider);

    // Comando para buscar e instalar paquetes
    let searchCommand = vscode.commands.registerCommand('npme.searchAndInstall', () => {
        const panel = SearchPanel.createOrShow(context.extensionUri);
        
        // Suscribirse al evento de instalación de paquetes
        if (SearchPanel.currentPanel) {
            SearchPanel.currentPanel.onPackageInstalled(() => {
                // Refrescar la vista de paquetes después de instalar
                setTimeout(() => {
                    npmPackageProvider.refresh();
                }, 6000); // Esperar 6 segundos para que termine la instalación
            });
        }
    });

    // Comando para refrescar la vista
    let refreshCommand = vscode.commands.registerCommand('npme.refresh', () => {
        npmPackageProvider.refresh();
        vscode.window.showInformationMessage('Vista actualizada');
    });

    // Comando para mostrar detalles de un paquete instalado
    let showDetailsCommand = vscode.commands.registerCommand('npme.showPackageDetails', (packageName: string, version: string, isDev: boolean) => {
        const detailsPanel = SearchPanel.showPackageDetails(context.extensionUri, packageName, version, isDev);
        
        // Suscribirse al evento de desinstalación para refrescar la vista
        detailsPanel.onPackageInstalled(() => {
            setTimeout(() => {
                npmPackageProvider.refresh();
            }, 1000);
        });
    });

    // Agregar los comandos al contexto de la extensión
    context.subscriptions.push(searchCommand, refreshCommand, showDetailsCommand);
}

// Este método se llama cuando tu extensión se desactiva
export function deactivate() {}
