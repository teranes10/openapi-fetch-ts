import fs from "fs";
import path from "path";

type Input = { src: string; output: string };
type Options = { src: Input[] };

export default function OpenApiFetch({ src }: Options) {
  return {
    name: "openapi-fetch-ts",
    async buildStart() {
      for (const input of src) {
        const outDir = input.output.split("/").splice(-1).join("/");
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }

        const swaggerJson = await getSwaggerJson(input.src);
        loadSwagger(swaggerJson, input.output);
      }
    },
  };
}

async function getSwaggerJson(src: string) {
  if (src.includes("http")) {
    return await fetch(src).then((res) => res.json());
  }

  let data = fs.readFileSync(src, "utf-8");
  return JSON.parse(data.toString());
}

async function loadSwagger(swaggerJson: any, fileName: string) {
  const typesContent = schemasToTypesString(
    swaggerJson.components.schemas as Schemas
  );

  const endpointsContent =
    "export type Endpoints = " +
    getEndpointsTypeString(swaggerJson.paths as Item);

  const content = `${endpointsContent}\n\n${typesContent}`;

  try {
    fs.writeFileSync(fileName, content);
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
  let endpoints = "{\n";

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

      endpoints += `\t\t${method}: { response: ${responseType}, request: ${
        hasOptions ? "{ " : "undefined,"
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

  endpoints += `}\n`;

  return endpoints;
}

function schemasToTypesString(schemas: Schemas) {
  let typesContent = "";

  for (const [schemaName, schema] of Object.entries(schemas)) {
    const typeObject = schemaToTypeObject(schema);
    const objectString = objectToTypeString(typeObject);
    typesContent += `export type ${schemaName} = ${objectString}\n`;
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
