import { Capacitor, CapacitorHttp } from "@capacitor/core";

export async function nativeHttpPost(url: string, body: object, headers?: Record<string, string>): Promise<any> {
  const isMobile = Capacitor.isNativePlatform();
  
  if (isMobile) {
    try {
      const response = await CapacitorHttp.post({
        url,
        headers: { 'Content-Type': 'application/json', ...headers },
        data: body,
      });
      return response.data;
    } catch (error) {
      console.error('[NativeHttp] CapacitorHttp POST failed:', error);
      throw error;
    }
  } else {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    return response.json();
  }
}

export async function nativeHttpGet(url: string, headers?: Record<string, string>): Promise<any> {
  const isMobile = Capacitor.isNativePlatform();
  
  if (isMobile) {
    try {
      const response = await CapacitorHttp.get({
        url,
        headers: headers || {},
      });
      return response.data;
    } catch (error) {
      console.error('[NativeHttp] CapacitorHttp GET failed:', error);
      throw error;
    }
  } else {
    const response = await fetch(url, {
      method: 'GET',
      headers: headers || {},
    });
    return response.json();
  }
}

export async function nativeHttpPostText(url: string, body: string, headers?: Record<string, string>): Promise<string> {
  const isMobile = Capacitor.isNativePlatform();
  
  if (isMobile) {
    try {
      const response = await CapacitorHttp.post({
        url,
        headers: { 'Content-Type': 'text/plain', ...headers },
        data: body,
      });
      return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    } catch (error) {
      console.error('[NativeHttp] CapacitorHttp POST text failed:', error);
      throw error;
    }
  } else {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', ...headers },
      body,
    });
    return response.text();
  }
}

export function isMobilePlatform(): boolean {
  return Capacitor.isNativePlatform();
}
