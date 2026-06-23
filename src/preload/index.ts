import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels, type FindiasApi } from '../shared/api'

const api: FindiasApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.getAppInfo),
  getSetupState: () => ipcRenderer.invoke(IpcChannels.getSetupState),
  chooseGameFolder: () => ipcRenderer.invoke(IpcChannels.chooseGameFolder)
}

contextBridge.exposeInMainWorld('findias', api)
