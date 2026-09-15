import { app, Menu, MenuItemConstructorOptions } from 'electron';
import { getMainWindow } from '../window/windowManager';

export function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Archivo',
      submenu: [
        isMac ? { role: 'close' as const } : { role: 'quit' as const, label: 'Salir' },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo' as const, label: 'Deshacer' },
        { role: 'redo' as const, label: 'Rehacer' },
        { type: 'separator' as const },
        { role: 'cut' as const, label: 'Cortar' },
        { role: 'copy' as const, label: 'Copiar' },
        { role: 'paste' as const, label: 'Pegar' },
        { role: 'selectAll' as const, label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' as const, label: 'Recargar' },
        { role: 'forceReload' as const, label: 'Forzar recarga' },
        {
          label: 'Alternar Herramientas de Desarrollador',
          accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: () => {
            const win = getMainWindow();
            if (win) {
              win.webContents.toggleDevTools();
            }
          },
        },
        { type: 'separator' as const },
        { role: 'resetZoom' as const, label: 'Restablecer zoom' },
        { role: 'zoomIn' as const, label: 'Acercar' },
        { role: 'zoomOut' as const, label: 'Alejar' },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const, label: 'Pantalla completa' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
