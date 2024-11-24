export class AppwriteRequest {
    headers: { [key: string]: string };
    method: string;
    host: string;
    scheme: string;
    query: { [key: string]: string };
    queryString: string;
    port?: number;
    url: string;
    path: string;
  
    private _bodyBinary: Buffer;
  
    constructor(data: {
      headers?: { [key: string]: string };
      method?: string;
      host?: string;
      scheme?: string;
      query?: { [key: string]: string };
      queryString?: string;
      port?: number;
      url?: string;
      path?: string;
      bodyBinary?: Buffer;
    }) {
      this.headers = data.headers || {};
      this.method = data.method || "GET";
      this.host = data.host || "localhost";
      this.scheme = data.scheme || "http";
      this.query = data.query || {};
      this.queryString = data.queryString || "";
      this.port = data.port;
      this.url = data.url || "";
      this.path = data.path || "/";
      this._bodyBinary = data.bodyBinary || Buffer.alloc(0);
    }
  
    get contentType(): string {
      return this.headers["content-type"] || "";
    }
  
    get bodyBinary(): Buffer {
      return this._bodyBinary;
    }
  
    get bodyText(): string {
      return this._bodyBinary.toString("utf8");
    }
  
    get bodyJson(): any {
      try {
        return JSON.parse(this.bodyText);
      } catch {
        return null;
      }
    }
  
    get bodyRaw(): string {
      return this.bodyText;
    }
  
    get body(): any {
      if (this.contentType.startsWith("application/json")) {
        return this.bodyBinary.length > 0 ? this.bodyJson : {};
      }
      return this.bodyText;
    }
  }