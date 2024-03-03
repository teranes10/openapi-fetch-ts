import type { Endpoints } from "./.generated/types.ts";

export function create(baseConfigs?: {
  baseUrl?: string;
  interceptor?: Interceptor;
}) {
  const baseUrl = baseConfigs?.baseUrl ? getBaseUrl(baseConfigs.baseUrl) : "";
  const interceptor = baseConfigs?.interceptor;

  async function request<
    Url extends keyof Endpoints,
    Method extends keyof Endpoints[Url],
    Options extends Endpoints[Url][Method],
    TRequest extends Options["request"],
    TResponse extends Options["response"]
  >(
    url: Url,
    method: Method,
    ...args: TRequest extends undefined ? [] : [options: TRequest]
  ): Promise<Result<TResponse>> {
    const options = args[0] as RequestConfig | undefined;

    const configs: RequestConfig = {
      baseUrl,
      url,
      method: method as RequestMethod,
      headers: { "Content-Type": "application/json" },
      body: options?.body as RequestBody,
      params: options?.params as RequestParams,
      responseType: "json",
    };

    async function next(): Promise<Result<TResponse>> {
      const url = getRequestUrl(configs.baseUrl, configs.url, configs.params);

      const response = await fetch(url, {
        headers: new Headers(configs.headers),
        method: configs.method || "get",
        body: JSON.stringify(configs.body || {}),
      });

      const status = response.status;
      const data = await getResponse(response, configs.responseType);
      return { status, data };
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

function getResponse(response: Response, type: ResponseType) {
  switch (type) {
    case "text":
      return response.text();
    case "blob":
      return response.blob();
    default:
      return response.json();
  }
}

type RequestUrl = `${"http" | "/"}${string}`;
type RequestMethod = "get" | "post" | "put" | "patch" | "delete";
type RequestParams = { [key: string]: any };
type RequestBody = BodyInit;
type RequestHeaders = { [key: string]: string };
type ResponseType = "text" | "json" | "blob";

type Result<T = any> = {
  status: number;
  data: T;
};

type RequestConfig = {
  baseUrl: string;
  url: RequestUrl;
  method: RequestMethod;
  headers: RequestHeaders;
  params: RequestParams;
  body: RequestBody;
  responseType: ResponseType;
};

type Interceptor = (
  config: RequestConfig,
  next: () => Promise<any>
) => Promise<Result>;

export function useStringTemplateWithReplacements(
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
