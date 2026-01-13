const { app, Menu, Tray, nativeImage } = require('electron');
const path = require('path');

let tray = null;

function initializeTray(appInstance, mainWindow) {
  // Create tray icon
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');

  // Create a native image (you'll need to create this icon)
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // Fallback: create a simple icon
      icon = nativeImage.createEmpty();
    }
  } catch (error) {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Rahat Backup Agent');

  // Create context menu
  const updateContextMenu = (status = 'offline') => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Rahat Backup Agent',
        enabled: false,
      },
      {
        type: 'separator',
      },
      {
        label: `Status: ${status}`,
        enabled: false,
      },
      {
        type: 'separator',
      },
      {
        label: 'Show Dashboard',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        type: 'separator',
      },
      {
        label: 'Quit',
        click: () => {
          appInstance.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
  };

  // Initial menu
  updateContextMenu('offline');

  // Double-click to show window
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Return functions to update tray
  return {
    updateStatus: (status) => {
      updateContextMenu(status);
    },
    setToolTip: (text) => {
      tray.setToolTip(text);
    },
  };
}

module.exports = {
  initializeTray,
};
