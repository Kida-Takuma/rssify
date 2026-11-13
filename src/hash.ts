export async function sha256Hex(value: string, length = 64): Promise<string> {
  const digest = await digestOf(value);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

export async function sha256Base64(value: string): Promise<string> {
  return btoa(String.fromCharCode(...(await digestOf(value))));
}

async function digestOf(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
