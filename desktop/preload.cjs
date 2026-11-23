// 게임 화면에서 쓸 수 있는 창 조작 기능만 골라서 넘겨준다
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  setFullscreen: (on) => ipcRenderer.send('set-fullscreen', !!on),
  setSize: (w, h) => ipcRenderer.send('set-size', w, h),
  quit: () => ipcRenderer.send('quit'),
});
