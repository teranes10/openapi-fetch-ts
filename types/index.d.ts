export type RequestUrl = `${"http" | "/"}${string}`;
export type RequestMethod = "get" | "post" | "put" | "patch" | "delete";
export type RequestParams = { [key: string]: any };
export type RequestBody = BodyInit;
export type RequestHeaders = { [key: string]: string };
export type ResponseType = "text" | "json" | "blob";

export type Result<T = any> = {
  status: number;
  data: T;
};

export type RequestConfig = {
  baseUrl: string;
  url: RequestUrl;
  method: RequestMethod;
  headers: RequestHeaders;
  params: RequestParams;
  body: RequestBody;
  responseType: ResponseType;
};

export type Interceptor = (
  config: RequestConfig,
  next: () => Promise<any>
) => Promise<Result>;

declare function create<Endpoints>(baseConfigs?: {
  baseUrl?: string;
  interceptor?: Interceptor;
}): {
  request: <
    Url extends keyof Endpoints,
    Method extends keyof Endpoints[Url],
    Options extends Endpoints[Url][Method],
    TRequest extends Options["request"],
    TResponse extends Options["response"]
  >(
    url: Url,
    method: Method,
    ...args: TRequest extends undefined ? [] : [options: TRequest]
  ) => Promise<Result<TResponse>>;
};

export { create };
