import { writeFile, readFile, mkdir, access } from "fs/promises";
import { dirname, join } from "path";
import { UserConfig } from "vite";

type Input = { input: string; output: string; mappings?: Record<string, string> }
export type OpenApiFetchOptions = { src: Input | Input[] };

const _defaultMappings = {
  Guid: 'string',
  HashID: 'string',
}

let _mappings: Record<string, string> = {}
let __dirname = ''

export default function OpenApiFetch({ src }: OpenApiFetchOptions) {
  return {
    name: "openapi-fetch-ts",
    async config(config: UserConfig) {
      config.define ??= { global: {} }
      config.define.global ??= {}
      config.define.global = {
        openApiFetch: {
          defaultMappings: _defaultMappings,
          src
        }
      }
    },
    configResolved(c: UserConfig) {
      __dirname = c.root || ''
    },
    async buildStart() {
      const inputs = Array.isArray(src) ? src : src ? [src] : []

      for (const input of inputs) {
        _mappings = { ..._defaultMappings, ...(input.mappings || {}) }
        const swaggerJson = await getSwaggerJson(input.input);
        if (swaggerJson) {
          loadSwagger(swaggerJson, input.output);
        }
      }
    },
  };
}

async function getSwaggerJson(src: string) {
  try {
    if (src.includes("http")) {
      return await fetch(src).then((res) => res.json());
    }

    let data = await readFile(join(__dirname, src), "utf-8");
    return JSON.parse(data.toString());
  } catch (e) {

  }
}

async function loadSwagger(swaggerJson: any, fileName: string) {
  const schemas = swaggerJson?.components?.schemas as Schemas
  const typesContent = schemas ? schemasToTypesString(schemas) : '';

  const paths = swaggerJson.paths as Item
  const endpointTypesContent = paths ? getEndpointsTypeString(paths) : ''
  const endpointsContent = "export type Endpoints = {\n" + endpointTypesContent + "}\n";
  const content = `/* eslint-disable ts/consistent-type-definitions */
  ${endpointsContent}
  ${typesContent}
  `;

  try {
    const filePath = join(__dirname, fileName)
    await mkdirs(dirname(filePath))
    await writeFile(filePath, content);
  } catch (err) {
    console.error("Error writing file: ", err);
  }
}

function getEndpointsTypeString(paths: {
  [key: string]: {
    parameters: any[];
    requestBody: any;
    responses: any;
  };
}) {
  let endpoints = "";
  for (const [endpointPath, endpoint] of Object.entries(paths)) {
    endpoints += `\t'${endpointPath}': {\n`;

    for (const [
      method,
      { parameters, requestBody, responses },
    ] of Object.entries(endpoint)) {
      const hasOptions =
        parameters ||
        (requestBody && requestBody.content?.["application/json"]?.schema);

      const responseSchema =
        responses?.["200"]?.content?.["application/json"]?.schema;

      const responseType = responseSchema ? getType(responseSchema) : "any";

      endpoints += `\t\t${method}: { response: ${responseType}, request: ${hasOptions ? "{ " : "undefined,"
        }`;

      if (parameters) {
        endpoints += `params: { ${parameters
          .map((param: any) => `${param.name}: ${getType(param.schema)}`)
          .join(", ")}, }, `;
      }

      if (requestBody && requestBody.content?.["application/json"]?.schema) {
        endpoints += `body: ${getType(
          requestBody.content["application/json"].schema
        )}, `;
      }

      if (hasOptions) {
        endpoints += `}`;
      }

      endpoints += `},\n`;
    }

    endpoints += `\t}\n`;
  }

  return endpoints;
}

function schemasToTypesString(schemas: Schemas) {
  let typesContent = "";

  for (const [schemaName, schema] of Object.entries(schemas)) {
    const mappedValue = _mappings[schemaName]
    if (mappedValue) {
      typesContent += `export type ${schemaName} = ${mappedValue}\n`;
      continue;
    }

    const typeObject = schemaToTypeObject(schema);
    const objectString = objectToTypeString(typeObject);
    typesContent += `export interface ${schemaName} ${objectString}\n`;
  }

  return typesContent;
}

function objectToTypeString(item: Props) {
  let type = "{\n";

  for (const [prop, value] of Object.entries(item)) {
    type += `\t${prop}${value.nullable ? "?:" : ":"} ${value.type};\n`;
  }

  type += "}\n";

  return type;
}

function schemaToTypeObject(schema: Schema): Props {
  const item: Props = {};

  const props = schema.properties || {};
  for (const [propName, prop] of Object.entries(props)) {
    item[propName] = { type: getPropType(prop), nullable: !!prop.nullable };
  }

  return item;
}

function getPropType(prop: SchemaProp): string {
  if (prop.type === "array") {
    return `${getType(prop.items!)}[]`;
  }

  return getType(prop);
}

function getType(prop: SchemaProp): string {
  if (prop.$ref) {
    return refToSchemaName(prop.$ref);
  }

  return jsonTypeToTsType(prop.type!);
}

function refToSchemaName(ref: string): string {
  const parts = ref.split("/");
  return parts[parts.length - 1];
}

function jsonTypeToTsType(jsonType: JsonType): string {
  switch (jsonType) {
    case "integer":
    case "number":
      return "number";
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    default:
      return "any";
  }
}

type Item = { [key: string]: any };
type Props = { [key: string]: { type: string; nullable: boolean } };

type JsonType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object";

type Schemas = {
  [key: string]: Schema;
};

type Schema = {
  type: JsonType;
  properties?: { [key: string]: SchemaProp };
};

type SchemaProp = {
  type?: JsonType;
  nullable?: boolean;
  $ref?: string;
  items?: SchemaProp;
};

export async function mkdirs(dir: string) {
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }
}

export async function exists(path: string) {
  try {
    await access(path)
    return true
  }
  // eslint-disable-next-line unused-imports/no-unused-vars
  catch (e) {
    return false
  }
}