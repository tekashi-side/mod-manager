import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels, type DownloadProgress, type FindiasApi } from '../shared/api';

const api: FindiasApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.getAppInfo),
  getSetupState: () => ipcRenderer.invoke(IpcChannels.getSetupState),
  chooseGameFolder: () => ipcRenderer.invoke(IpcChannels.chooseGameFolder),
  refresh: () => ipcRenderer.invoke(IpcChannels.refresh),
  installOrUpdate: (modId) => ipcRenderer.invoke(IpcChannels.installOrUpdate, modId),
  deleteMod: (modId) => ipcRenderer.invoke(IpcChannels.deleteMod, modId),
  setDisabled: (modId, disabled) => ipcRenderer.invoke(IpcChannels.setDisabled, modId, disabled),
  setIncludePrereleases: (value) => ipcRenderer.invoke(IpcChannels.setIncludePrereleases, value),
  onDownloadProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, progress: DownloadProgress): void =>
      callback(progress);
    ipcRenderer.on(IpcChannels.downloadProgress, listener);
    return () => ipcRenderer.removeListener(IpcChannels.downloadProgress, listener);
  },
};

contextBridge.exposeInMainWorld('findias', api);
