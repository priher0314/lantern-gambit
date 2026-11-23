// PC 실행 파일(스팀 등)용 껍데기. 웹 게임을 그대로 창에 띄운다.
// 실행: npm start   /   배포용 폴더 만들기: npm run dist
const { app, BrowserWindow, ipcMain, protocol, net, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// 게임 파일을 app://game/ 주소로 제공한다(주소가 항상 같아야 저장이 유지된다)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#0b0716',
    title: 'SPIN TILL DAWN',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  // 게임 밖 주소는 창 안에서 열지 않는다
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://game/')) e.preventDefault();
  });
  win.on('closed', () => (win = null));
  win.loadURL('app://game/index.html');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    const root = app.getAppPath();
    protocol.handle('app', (req) => {
      const u = new URL(req.url);
      let p = decodeURIComponent(u.pathname);
      if (p === '/' || p === '') p = '/index.html';
      const file = path.normalize(path.join(root, p));
      if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });

    ipcMain.on('set-fullscreen', (_e, on) => win && win.setFullScreen(!!on));
    ipcMain.on('set-size', (_e, w, h) => {
      if (!win || win.isFullScreen()) return;
      w = Math.max(960, Math.min(7680, Math.round(Number(w) || 1280)));
      h = Math.max(540, Math.min(4320, Math.round(Number(h) || 720)));
      win.setContentSize(w, h);
      win.center();
    });
    ipcMain.on('quit', () => app.quit());

    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
