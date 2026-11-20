import { validateAgainstSchema, type SiiSchemaName } from '../../src/schemas'

export type SiiSchema = SiiSchemaName

/**
 * Validates against an official SII schema, as the package carries it, and returns the errors, none when the XML is
 * valid.
 */
export const validateAgainstXsd = async (xml: string, schema: SiiSchema): Promise<readonly string[]> =>
  (await validateAgainstSchema(xml, { schema })).map((issue) => issue.message)
