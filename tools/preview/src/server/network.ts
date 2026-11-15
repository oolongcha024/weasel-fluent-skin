import { isIP, type AddressInfo } from 'node:net';

export interface NetworkOptions { host: string; port: number }

export function resolveNetworkOptions(input: { host?: string; port?: string | number } = {}): NetworkOptions {
  const host = input.host ?? 'localhost';
  const hostname = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (!hostname || (host !== hostname && isIP(hostname) !== 6)
    || (!isIP(hostname) && !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(hostname))) {
    throw new Error('监听地址应为 IP 或主机名，不包含协议、路径或端口。');
  }
  const port = input.port === undefined ? 0 : Number(input.port);
  if ((typeof input.port === 'string' && !/^\d+$/.test(input.port)) || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('端口应在 0–65535 之间；0 表示自动分配。');
  }
  return { host: hostname, port };
}

/** A listener may bind every interface; local clients still need a concrete address. */
export function connectionUrl(address: AddressInfo) {
  const host = address.address === '0.0.0.0' ? '127.0.0.1' : address.address === '::' ? '::1' : address.address;
  return `http://${isIP(host) === 6 ? `[${host}]` : host}:${address.port}`;
}
