import {JSONValue} from '../../binary-protocol/src/message-constants'
import { Storage, StorageWriteCallback, StorageReadCallback, DeepstreamPlugin } from '../types'

export default class LocalCache extends DeepstreamPlugin implements Storage {
  public description = 'local cache'
  public apiVersion = 2

  private data = new Map<string, { version: number, data: JSONValue }>()

  public set (key: string, version: number, data: any, callback: StorageWriteCallback) {
    this.data.set(key, { version, data })
    process.nextTick(() => callback(null))
  }

  public get (key: string, callback: StorageReadCallback) {
    const data = this.data.get(key)
    if (!data) {
      process.nextTick(() => callback(null, -1, null))
    } else {
      process.nextTick(() => callback(null, data.version, data.data))
    }
  }

  public delete (key: string, callback: StorageWriteCallback) {
    this.data.delete(key)
    process.nextTick(() => callback(null))
  }
}
