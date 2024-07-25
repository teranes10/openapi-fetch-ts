export function create<Endpoints>(baseConfigs?: {
  baseUrl?: string;
  interceptor?: Interceptor;
}) {
  const baseUrl = baseConfigs?.baseUrl ? getBaseUrl(baseConfigs.baseUrl) : "";
  const interceptor = baseConfigs?.interceptor;

  async function request<
    Url extends keyof Endpoints,
    Method extends keyof Endpoints[Url],
    Options extends { request: undefined, response: undefined } & Endpoints[Url][Method],
    TRequest extends Options["request"],
    TResponse extends Options["response"]
  >(
    url: Url,
    method: Method,
    ...args: TRequest extends undefined ? [options?: Partial<OtherConfigs>] : [options: TRequest & Partial<OtherConfigs>]
  ): Promise<FetchResult<TResponse>> {
    const options = (args as any)[0] as RequestConfig | undefined;

    const configs: RequestConfig = {
      baseUrl,
      url: url as RequestUrl,
      method: method as RequestMethod,
      headers: options?.headers || {},
      body: options?.body as RequestBody,
      params: options?.params as RequestParams,
      responseType: options?.responseType,
      errorResponseType: options?.errorResponseType
    };

    async function next(): Promise<FetchResult<TResponse>> {
      const url = getRequestUrl(configs.baseUrl, configs.url, configs.params);

      let response;
      try {
        response = await fetch(url, {
          headers: new Headers({ ...(!(configs.body instanceof FormData) && { "Content-Type": "application/json" }), ...configs.headers }),
          method: configs.method || "get",
          ...(!!configs?.body && { body: configs.body instanceof FormData ? configs.body : JSON.stringify(configs.body) })
        });
      } catch (error: any) {
        throw { message: error.message };
      }

      const result = response as FetchResult<TResponse>;
      result.message = getMessage(response.status);

      if (response.ok) {
        result.data = await getResponse(response, configs.responseType);
        return result;
      }

      result.data = await getResponse(response, configs.errorResponseType);
      throw result;
    }

    return interceptor ? interceptor(configs, next) : next();
  }

  return { request };
}

function getBaseUrl(url: string) {
  return url?.endsWith("/") ? url.slice(0, -1) : url || "";
}

function getRequestUrl(
  baseUrl: string,
  url: RequestUrl,
  params: RequestParams
) {
  const urlTemplate = url.startsWith("http")
    ? url
    : url.startsWith("/")
      ? baseUrl + url
      : baseUrl + "/" + url;

  if (params) {
    const parameters = Object.assign({}, params);
    const { value, replacedKeys } = useStringTemplateWithReplacements(
      urlTemplate,
      parameters
    );

    replacedKeys.forEach((key) => delete parameters[key]);
    if (Object.keys(parameters).length > 0) {
      let newUrl = value + "?";
      for (const [key, value] of Object.entries(parameters)) {
        newUrl += key + "=" + value + "&";
      }

      return newUrl.endsWith("&") ? newUrl.slice(0, -1) : newUrl;
    }

    return value;
  }

  return urlTemplate;
}

function getResponse(response: Response, type?: ResponseType) {
  const _type: ResponseType = type || getResponseType(response) || 'json'

  switch (_type) {
    case "text":
      return response.text();
    case "blob":
      return response.blob();
    default:
      return response.json();
  }
}

function getResponseType(response: Response): ResponseType | undefined {
  const type = response?.headers?.get('content-type')
  if(!type) {
    return undefined
  }

  if(type?.includes('application/json')) {
    return 'json'
  }

  if(type?.includes('application/octet-stream')) {
    return 'blob'
  }

  if (type.includes('text/plain') || type.includes('text/html')) {
    return 'text';
  }

  return undefined;
}

function getMessage(status: number) {
  switch (status) {
    case 200:
      return "Success";
    case 400:
      return "BadRequest";
    case 401:
      return "UnAuthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "NotFound";
    case 409:
      return "Conflict";
    case 422:
      return "UnprocessableEntity";
    case 500:
      return "InternalServerError";
    default:
      return "Unknown";
  }
}

function useStringTemplateWithReplacements(
  template: string,
  replacements: Record<string, string>
) {
  const replacedKeys: Set<string> = new Set();
  const notReplacedKeys: Set<string> = new Set();

  const value = template.replace(/{(\w+)}/g, (match, key) => {
    const replacement = replacements[key];
    if (replacement !== undefined) {
      replacedKeys.add(key);
      return replacement;
    }

    notReplacedKeys.add(key);
    return match;
  });

  return {
    value,
    replacedKeys: Array.from(replacedKeys),
    notReplacedKeys: Array.from(notReplacedKeys),
  };
}

export type RequestUrl = `${"http" | "/"}${string}`;
export type RequestMethod = "get" | "post" | "put" | "patch" | "delete";
export type RequestParams = { [key: string]: any };
export type RequestBody = BodyInit;
export type RequestHeaders = { [key: string]: string };
export type ResponseType = "text" | "json" | "blob";
export type ErrorResponseType = "text" | "json";

export type FetchResult<T = any> = Response & {
  data: T;
  message: string;
};

export type RequestConfig = {
  baseUrl: string;
  url: RequestUrl;
  method: RequestMethod;
  headers: RequestHeaders;
  params: RequestParams;
  body: RequestBody;
  responseType?: ResponseType;
  errorResponseType?: ErrorResponseType
};

export type OtherConfigs = {
  headers: RequestHeaders;
  responseType: ResponseType;
  errorResponseType: ErrorResponseType
}

export type Interceptor = (
  config: RequestConfig,
  next: () => Promise<any>
) => Promise<FetchResult>;
