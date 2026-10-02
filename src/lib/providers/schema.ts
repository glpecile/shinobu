import { Option, Predicate, Schema, SchemaGetter } from 'effect';

/** Provider metadata may be omitted or null; normalize both to an optional field. */
export function optionalNullable<S extends Schema.Constraint>(schema: S) {
  return Schema.optional(Schema.NullOr(schema)).pipe(
    Schema.decodeTo(Schema.optional(Schema.toType(schema)), {
      decode: SchemaGetter.transformOptional(Option.filter(Predicate.isNotNull)),
      encode: SchemaGetter.passthrough(),
    }),
  );
}
