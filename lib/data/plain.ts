/** A stored document's plain record. */
export type Plain<D extends {_id: string}> = Omit<D, '_id'> & {id: string};

/** Anything with a schema, e.g. a Mongoose model. */
type HasSchema = {schema: {paths: Record<string, unknown>}};

const optionalPaths = new WeakMap<object, string[]>();

function topLevelPaths(model: HasSchema) {
  let paths = optionalPaths.get(model.schema);
  if (!paths) {
    paths = Object.keys(model.schema.paths).filter(
      (path) => path !== '_id' && !path.includes('.'),
    );
    optionalPaths.set(model.schema, paths);
  }
  return paths;
}

/**
 * A lean document as its plain record: `_id` becomes `id`, and fields missing
 * from older documents read as null, as the types promise.
 */
export function toPlain<D extends {_id: string}>(model: HasSchema, doc: D): Plain<D> {
  const {_id, ...fields} = doc;
  const plain: Record<string, unknown> = {id: _id};
  for (const path of topLevelPaths(model)) plain[path] = null;
  return Object.assign(plain, fields) as Plain<D>;
}

/** `toPlain` for each document. */
export function toPlainAll<D extends {_id: string}>(
  model: HasSchema,
  docs: readonly D[],
): Plain<D>[] {
  return docs.map((doc) => toPlain(model, doc));
}

/** For `$regex`: matches `text` literally. */
export function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
