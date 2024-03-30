// IMPORT YOUR STUFF FROM @/schemas HERE

export const globalMaps = {
  yourSchema: new Map(),
};

const globalConvert = async () => {
  // Convert and update councils
  const someSchema = await yourSchemaParserFunc();
  someSchema.forEach((schema: any) => {
    globalMaps.yourSchema.set(schema.idOrig, schema);
  });
};

// Helper function to update or initialize array in a map
function updateMapArray(map: Map<any, any>, key: any, value: any) {
  let array = map.get(key);
  if (!array) {
    array = [];
    map.set(key, array);
  }
  array.push(value);
}

export const globallyConvertAll = async () => {
  // First pass to create the maps
  await globalConvert();
  // Second pass to link the entities
  await globalConvert();
};

export const yourSchemaParserFunc = async () => {
  // Do your conversions here and return the result or create a conversion
  // I mapped my JSON values to Appwrite so I could parse an object e.g.
  /**
   * {
   *     "key": "value"
   * }
   * becomes
   * someSchema.parse({
   *  newKey: object[key],
   *  and so on for the rest of the keys to convert
   * })
   *
   * Then I return the parsed object to upload to Appwrite
   */
  return [];
};
