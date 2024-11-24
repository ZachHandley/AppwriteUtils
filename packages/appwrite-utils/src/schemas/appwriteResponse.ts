export interface AppwriteResponse {
  send: (
    body: any,
    statusCode?: number,
    headers?: Record<string, string>
  ) => { body: any; statusCode: number; headers: Record<string, string> };
  text: (
    body: string | Uint8Array | Response,
    statusCode?: number,
    headers?: Record<string, string>
  ) => {
    body: Uint8Array;
    statusCode: number;
    headers: Record<string, string>;
  };
  binary: (
    bytes: Uint8Array,
    statusCode?: number,
    headers?: Record<string, string>
  ) => {
    body: Uint8Array;
    statusCode: number;
    headers: Record<string, string>;
  };
  json: (
    obj: any,
    statusCode?: number,
    headers?: Record<string, string>
  ) => {
    body: Uint8Array;
    statusCode: number;
    headers: Record<string, string>;
  };
  empty: () => {
    body: Uint8Array;
    statusCode: number;
    headers: Record<string, string>;
  };
  redirect: (
    url: string,
    statusCode?: number,
    headers?: Record<string, string>
  ) => {
    body: Uint8Array;
    statusCode: number;
    headers: Record<string, string>;
  };
}
