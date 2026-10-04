const { BrowserWindow, screen } = require('electron');
const path = require('path');

function createOverlay() {
  const { workArea } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      autoplayPolicy: 'no-user-gesture-required', // let mood/ambient sounds play without a click
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  // Include macOS fullscreen browser Spaces, as well as ordinary desktops.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  return win;
}

module.exports = { createOverlay };
